import { prismaEnabled, getPrismaClient } from "../../lib/db";
import type { Stage, FailureClass } from "./stages";

// The processing-task ledger writer (240-ops-read-models section 4.1/4.2).
//
// Until this existed the pipeline was fire-and-forget: the runtime ran, and
// nothing durable recorded that it had. The 加工管道 domain therefore queried no
// database at all - every task on that page was a demo constant.
//
// Scope, stated so it is not over-read: these rows make the pipeline
// OBSERVABLE. They do not make it RESUMABLE. Resuming across a restart means
// reading queued/running rows back into the in-memory queue on boot, which is a
// separate change this table enables and this file does not perform.
//
// Same two rules as the supply ledger, for the same reasons:
//   1. RECORDING MUST NEVER FAIL A TASK. A document that indexed correctly must
//      not be reported as failed because a bookkeeping write failed.
//   2. The state mapping is PURE, so it is testable without a database.
//
// Rows are addressed by DOCUMENT, not by a task id threaded through the queue:
// uidx_processing_task_doc_live guarantees at most one queued/running row per
// document, so "the live task for this document" is unambiguous by construction.
// That is the same index that stops two pipelines racing on one document - it
// buys the concurrency guarantee AND the addressing scheme.

export type TaskTier = "interactive" | "sync" | "bulk";
export type TaskState = "queued" | "running" | "suspended" | "failed" | "done";
export type StageOutcome = "ok" | "failed" | "skipped" | "ai_assisted";

/** Where a finished RUN can leave a task. `running` is absent on purpose: it is
 *  entered by started(), never by an outcome, so the type makes the impossible
 *  case unrepresentable instead of leaving it to a cast at the call site. */
export type SettledState = Extract<TaskState, "done" | "failed" | "suspended" | "queued">;

export interface TaskEnqueued {
  docId: string;
  kbId: string;
  tier: TaskTier;
  attempt: number;
  createdInProduct?: string | null;
  createdBy?: string | null;
}

export interface TaskSettled {
  docId: string;
  /** Where the run left the task. `queued` IS a legal outcome - that is a retry,
   *  the same work waiting again (see stateForAction). */
  state: SettledState;
  failureClass?: FailureClass | null;
  reason?: string | null;
  /** The stage the run reached; recorded so a failure names where it stopped. */
  stage?: Stage | null;
}

export interface TaskLedger {
  enqueued(e: TaskEnqueued): Promise<void>;
  started(docId: string): Promise<void>;
  stage(e: { docId: string; stage: Stage; outcome: StageOutcome; note?: string | null }): Promise<void>;
  settled(e: TaskSettled): Promise<void>;
}

/** The worker's outcome vocabulary mapped onto the table's state vocabulary.
 *
 *  `retry` deliberately maps to `queued`, NOT to a fourth state: a retry is the
 *  same work waiting again, and giving it its own state would make "how many are
 *  waiting" a two-term question on every query that asks it. The attempt counter
 *  is what distinguishes a retry, and it is already a column. */
export function stateForAction(action: "indexed" | "failed" | "retry" | "suspend"): SettledState {
  switch (action) {
    case "indexed":
      return "done";
    case "failed":
      return "failed";
    case "suspend":
      return "suspended";
    case "retry":
      return "queued";
  }
}

/** Whether an outcome ends the row's life as a LIVE task (queued/running). A
 *  suspended task has left the live set - it is parked awaiting resume, so a
 *  legitimately re-enqueued document is not blocked by it. */
export function leavesLiveSet(state: TaskState): boolean {
  return state !== "queued" && state !== "running";
}

export const NULL_TASK_LEDGER: TaskLedger = {
  async enqueued() {},
  async started() {},
  async stage() {},
  async settled() {},
};

class PrismaTaskLedger implements TaskLedger {
  async enqueued(e: TaskEnqueued): Promise<void> {
    await this.safely(async (p) => {
      // The partial unique index is the guard against a duplicate live row; a
      // collision here means the document is already in flight, which is
      // exactly the case enqueue dedup is meant to swallow.
      await p.processingTask.create({
        data: {
          documentId: e.docId,
          kbId: e.kbId,
          tier: e.tier,
          state: "queued",
          attempt: e.attempt + 1, // the queue counts generations from 0; the column counts attempts from 1
          createdInProduct: e.createdInProduct ?? null,
          createdBy: e.createdBy ?? null,
        },
      });
    });
  }

  async started(docId: string): Promise<void> {
    await this.safely(async (p) => {
      await p.processingTask.updateMany({
        where: { documentId: docId, state: "queued" },
        data: { state: "running", startedAt: new Date(), updatedAt: new Date() },
      });
    });
  }

  async stage(e: { docId: string; stage: Stage; outcome: StageOutcome; note?: string | null }): Promise<void> {
    await this.safely(async (p) => {
      const task = await p.processingTask.findFirst({
        where: { documentId: e.docId, state: { in: ["queued", "running"] } },
        select: { id: true },
      });
      if (!task) return;
      // One row per (task, stage) - uidx_processing_task_stage. A repeat within
      // the same attempt closes the existing row rather than adding a second,
      // which would double-count that stage in the P95.
      await p.processingTaskStage.upsert({
        where: { taskId_stage: { taskId: task.id, stage: e.stage } },
        create: { taskId: task.id, stage: e.stage, outcome: e.outcome, endedAt: new Date(), note: e.note ?? null },
        update: { outcome: e.outcome, endedAt: new Date(), note: e.note ?? null },
      });
      await p.processingTask.update({ where: { id: task.id }, data: { currentStage: e.stage, updatedAt: new Date() } });
    });
  }

  async settled(e: TaskSettled): Promise<void> {
    await this.safely(async (p) => {
      await p.processingTask.updateMany({
        where: { documentId: e.docId, state: { in: ["queued", "running"] } },
        data: {
          state: e.state,
          failureClass: e.failureClass ?? null,
          failureReason: e.reason ?? null,
          ...(e.stage ? { currentStage: e.stage } : {}),
          finishedAt: leavesLiveSet(e.state) ? new Date() : null,
          updatedAt: new Date(),
        },
      });
    });
  }

  /** Rule 1: bookkeeping never fails a task. */
  private async safely(fn: (p: Awaited<ReturnType<typeof getPrismaClient>>) => Promise<void>): Promise<void> {
    try {
      await fn(await getPrismaClient());
    } catch {
      /* a lost row understates a chart; a thrown error fails a document */
    }
  }
}

export function getTaskLedger(): TaskLedger {
  return prismaEnabled() ? new PrismaTaskLedger() : NULL_TASK_LEDGER;
}
