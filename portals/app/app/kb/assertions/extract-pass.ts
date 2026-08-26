// The extraction pass (KD-211): one bounded sweep over documents that have text
// but no assertions yet.
//
// THE DATABASE IS THE WORK LIST. There is no in-memory queue here, unlike the
// processing pipeline. That is not a shortcut - it follows from what extraction
// is. The processing queue exists because an upload is interactive: someone is
// waiting, and the work must start the instant the bytes land. Nobody waits for
// extraction. So the honest shape is a query - "which documents are indexed and
// have no settled extraction task for their active version" - and a restart
// loses exactly nothing, because nothing was ever held in memory to lose.
//
// Idempotency comes from the same place: a task row per (document, active
// version). A document already extracted at version 3 is not a candidate until
// something bumps it to 4.

import { getPrismaClient, prismaEnabled } from "../../lib/db";
import { getObjectStore } from "../storage/objectstore";
import { getExtractionClient } from "../atlas/extract";
import type { ExtractionClient } from "../atlas/extract";
import { runExtraction, type ExtractionRunResult } from "./extract-run";
import { tenantForWorkspace } from "../processing/atlas-embedder";

/** Documents per sweep. A bounded pass, re-invoked on a schedule - the same
 *  discipline the processing tick uses, and for the same reason: scheduling is
 *  the caller's job, not a hidden loop's. */
export const PASS_LIMIT = 20;

export interface PassOutcome {
  documentId: string;
  status: ExtractionRunResult["status"] | "error";
  reason: string | null;
  assertions: number;
}

export interface PassResult {
  scanned: number;
  extracted: number;
  parked: number;
  skipped: number;
  errors: number;
  outcomes: PassOutcome[];
}

const EMPTY: PassResult = { scanned: 0, extracted: 0, parked: 0, skipped: 0, errors: 0, outcomes: [] };

/**
 * Documents that have never been extracted.
 *
 * `indexed` only: extraction reads the same bytes retrieval already accepted, so
 * a document that never made it through processing has nothing trustworthy to
 * extract from. `activeChunkVersion` non-null is the same statement in the other
 * direction - it is the version stamp the task row is keyed on, and without it
 * there is nothing to say WHICH version was extracted.
 *
 * PARKED DOCUMENTS ARE NOT HERE - they are `resumable()` below. Filtering them
 * out of this query and forgetting the other half would have meant a document
 * parked on the missing `karda.extract` grant was never looked at again, which
 * is precisely the opposite of what parking means.
 */
async function candidates(limit: number) {
  const p = await getPrismaClient();
  return p.document.findMany({
    where: {
      contentState: "indexed",
      activeChunkVersion: { not: null },
      // No extraction task of any state. A FAILED one deliberately keeps the
      // document out: re-running it automatically would retry a permanent
      // failure forever. Clearing it is a deliberate act, like every re-run.
      processingTasks: { none: { kind: "extraction" } },
    },
    take: limit,
    orderBy: { updatedAt: "asc" }, // oldest first: no document starves
    select: {
      id: true,
      kbId: true,
      mime: true,
      storageRef: true,
      activeChunkVersion: true,
      knowledgeBase: { select: { workspaceId: true } },
    },
  });
}

/**
 * Extraction tasks parked on a capability or a quota.
 *
 * This is the whole reason parking is not failing: the day `vxture-atlas#39`
 * lands, these resume and produce assertions with no human un-failing anything.
 * The task ROW is reused rather than a new one created - a resumed run is the
 * same work, and a fresh row per sweep would turn one waiting document into a
 * growing pile of identical history.
 */
async function resumable(limit: number) {
  const p = await getPrismaClient();
  return p.processingTask.findMany({
    where: { kind: "extraction", state: "suspended" },
    take: limit,
    orderBy: { updatedAt: "asc" },
    select: {
      id: true,
      attempt: true,
      document: {
        select: {
          id: true,
          kbId: true,
          mime: true,
          storageRef: true,
          activeChunkVersion: true,
          contentState: true,
          knowledgeBase: { select: { workspaceId: true } },
        },
      },
    },
  });
}

/**
 * Run one bounded extraction sweep.
 *
 * Every document gets a task row, including the ones that park and the ones that
 * cannot be extracted at all. A pass that quietly skipped them would report
 * "0 documents needed extraction" forever while the same PDFs came back around
 * on every sweep - the row is what makes a non-result visible and stops it being
 * rediscovered.
 */
export async function runExtractionPass(
  opts: { limit?: number; client?: ExtractionClient; extractedBy?: string; resume?: boolean } = {},
): Promise<PassResult> {
  if (!prismaEnabled()) return EMPTY;

  const p = await getPrismaClient();
  const client = opts.client ?? getExtractionClient();
  const extractedBy = opts.extractedBy ?? "karda.extract";
  const objects = getObjectStore();

  const limit = opts.limit ?? PASS_LIMIT;

  // Parked work first, and it counts against the same limit. A sweep that always
  // took fresh documents first would let a steady trickle of uploads keep the
  // parked pile permanently at the back of the queue.
  const parked = opts.resume === false ? [] : await resumable(limit);
  const fresh = await candidates(Math.max(0, limit - parked.length));

  type Unit = { taskId: string | null; attempt: number; doc: (typeof fresh)[number] };
  const units: Unit[] = [
    ...parked
      // A document that left `indexed` since it parked is no longer extractable
      // from; it will come back around as fresh work after it reprocesses.
      .filter((t) => t.document.contentState === "indexed" && t.document.activeChunkVersion !== null)
      .map((t) => ({ taskId: t.id, attempt: t.attempt + 1, doc: t.document })),
    ...fresh.map((d) => ({ taskId: null, attempt: 1, doc: d })),
  ];

  const result: PassResult = { ...EMPTY, scanned: units.length, outcomes: [] };

  for (const { taskId, attempt, doc } of units) {
    const task = taskId
      ? await p.processingTask.update({
          where: { id: taskId },
          data: { state: "running", attempt, startedAt: new Date(), failureClass: null, failureReason: null, updatedAt: new Date() },
          select: { id: true },
        })
      : await p.processingTask.create({
          data: {
            documentId: doc.id,
            kbId: doc.kbId,
            kind: "extraction",
            tier: "bulk", // never interactive: nobody is waiting on an extraction
            state: "running",
            currentStage: "extract",
            startedAt: new Date(),
          },
          select: { id: true },
        });

    let outcome: PassOutcome;
    try {
      const bytes = doc.storageRef ? await objects.get(doc.storageRef) : null;
      // tenant != workspace. Atlas keys model authorization by PLATFORM TENANT
      // (`model_grants.tenant_id`, a real FK to `tenancy.tenants`), and the
      // mapping from our workspace to that tenant lives in the provisioning
      // contract table - `tenantForWorkspace` is the one place that reads it,
      // and the embed path has always gone through it. Sending the workspace id
      // in the tenant field type-checks, both are uuids, and it would have
      // resolved against the wrong tenant the moment the karda.extract grant
      // landed - which is exactly when nobody would be looking for it.
      const tenantId = await tenantForWorkspace(doc.knowledgeBase.workspaceId);
      if (!tenantId) {
        // Not provisioned on the platform yet: there is no tenant to bill or
        // authorize against, so this is not extractable rather than a failure.
        outcome = { documentId: doc.id, status: "not_extractable", reason: "no_platform_tenant", assertions: 0 };
        await settle(p, task.id, { status: "not_extractable", reason: "no_platform_tenant", windows: 0, raw: 0, batch: null, stored: null });
        result.skipped += 1;
        result.outcomes.push(outcome);
        continue;
      }
      const run = await runExtraction(client, {
        documentId: doc.id,
        documentVersion: doc.activeChunkVersion!,
        kbId: doc.kbId,
        mime: doc.mime,
        bytes,
        tenantId,
        workspaceId: doc.knowledgeBase.workspaceId,
        taskId: task.id,
        extractedBy,
        extractionRun: task.id,
      });
      outcome = {
        documentId: doc.id,
        status: run.status,
        reason: run.reason,
        assertions: run.stored?.assertionIds.length ?? 0,
      };
      await settle(p, task.id, run);
      if (run.status === "ok") result.extracted += 1;
      else if (run.status === "parked") result.parked += 1;
      else result.skipped += 1;
    } catch (e) {
      // Transient, or a karda-side bug. `failed` rather than suspended, so it is
      // visible and a human decides - parking it would hide it behind "waiting
      // on Atlas" forever.
      const reason = e instanceof Error ? e.message : String(e);
      outcome = { documentId: doc.id, status: "error", reason, assertions: 0 };
      await p.processingTask.update({
        where: { id: task.id },
        data: { state: "failed", failureClass: "transient", failureReason: reason, finishedAt: new Date(), updatedAt: new Date() },
      });
      result.errors += 1;
    }
    result.outcomes.push(outcome);
  }

  return result;
}

/** Settle the task row for a completed run. */
async function settle(
  p: Awaited<ReturnType<typeof getPrismaClient>>,
  taskId: string,
  run: ExtractionRunResult,
): Promise<void> {
  const settled =
    run.status === "ok"
      ? { state: "done", failureClass: null, failureReason: null }
      : run.status === "parked"
        ? {
            state: "suspended",
            // `unavailable` for a missing grant, `quota` for an exhausted one -
            // the two need opposite operator actions, so they must not share a
            // label. See incr/0008.
            failureClass: run.reason === "quota_exhausted" ? "quota" : "unavailable",
            failureReason: run.reason,
          }
        : // not_extractable: a PDF has no text to extract and never will until
          // deep parse ships. `done`, not `failed` - nothing went wrong, there
          // was simply nothing to do, and marking it failed would put a red row
          // in front of an operator with no action to take.
          { state: "done", failureClass: null, failureReason: run.reason };

  await p.processingTask.update({
    where: { id: taskId },
    // The model carries no @updatedAt, so every writer stamps it or the ops
    // read model reports a task that settled minutes ago as untouched.
    data: { ...settled, finishedAt: new Date(), updatedAt: new Date() },
  });
}
