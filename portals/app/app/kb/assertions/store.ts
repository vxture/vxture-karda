// Persistence for the assertion layer.
//
// Prisma-only, with no in-memory twin. That is the same call the evaluation
// store made and for the same reason: an assertion whose provenance does not
// persist cannot answer "who said this, when, from which version" - which is
// the entire reason the tables exist. Offline, extraction reports itself
// unavailable rather than writing assertions nobody can trace.
//
// One transaction per document extraction, never per assertion. A batch that
// half-lands leaves assertions whose evidence rows never arrived - and by the
// read-side invariant (kinds.ts `isRecallable`) those are invisible, so the
// failure would be silent: the corpus would look fine and quietly hold less
// than it should.

import { getPrismaClient } from "../../lib/db";
import type { PreparedAssertion } from "./extract";

export interface StoredExtraction {
  /** Ids of the assertions written, in the order they were prepared. */
  assertionIds: string[];
  spansWritten: number;
  evidenceWritten: number;
  /** Entities that did not exist in this library before this batch. */
  entitiesCreated: number;
  mentionsWritten: number;
}

export interface ExtractionContext {
  kbId: string;
  /** The steward run or model that produced these. Process accountability -
   *  never conflated with `assertedBy`, which is the source's authority. */
  extractedBy: string;
  /** The processing task this extraction belongs to, if it ran inside one. */
  extractionRun?: string | null;
}

/**
 * Write one document's extraction as a single transaction.
 *
 * Assertions land as `draft`, not `indexed`: they are not retrievable until the
 * indexing step says so, and defaulting to `indexed` here would put unverified
 * machine output into the default recall tier the moment it was written.
 *
 * Verification state is left at `unverified` regardless of what the source
 * document's state is - KD-209. The document's verification is a signal that
 * may be CONSULTED at read time; it is never copied here, because a copy is a
 * snapshot that goes stale the moment the document is re-verified or lapses.
 */
export async function storeExtraction(
  ctx: ExtractionContext,
  prepared: PreparedAssertion[],
): Promise<StoredExtraction> {
  const p = await getPrismaClient();
  if (prepared.length === 0) {
    return { assertionIds: [], spansWritten: 0, evidenceWritten: 0, entitiesCreated: 0, mentionsWritten: 0 };
  }

  return p.$transaction(async (tx) => {
    const assertionIds: string[] = [];
    let spansWritten = 0;
    let evidenceWritten = 0;
    let mentionsWritten = 0;

    // Entities first, and ONCE per surface form across the whole batch: two
    // assertions naming the same entity must resolve to one row, or the
    // library's registry grows a duplicate per mention.
    const surfaces = [...new Set(prepared.flatMap((a) => a.mentions))];
    const entityIds = new Map<string, string>();
    let entitiesCreated = 0;

    for (const name of surfaces) {
      const existing = await tx.entity.findFirst({
        where: { kbId: ctx.kbId, kind: "thing", name },
        select: { id: true },
      });
      if (existing) {
        entityIds.set(name, existing.id);
        continue;
      }
      const created = await tx.entity.create({
        data: { kbId: ctx.kbId, name, kind: "thing" },
        select: { id: true },
      });
      entityIds.set(name, created.id);
      entitiesCreated += 1;
    }

    for (const a of prepared) {
      const assertion = await tx.assertion.create({
        data: {
          kbId: ctx.kbId,
          kind: a.kind,
          subject: a.subject,
          statement: a.statement,
          assertedBy: a.assertedBy,
          asOf: a.asOf ? new Date(a.asOf) : null,
          validUntil: a.validUntil ? new Date(a.validUntil) : null,
          extractedBy: ctx.extractedBy,
          extractionRun: ctx.extractionRun ?? null,
          confidence: a.confidence,
          // Draft, not indexed: writing is not admission to retrieval.
          contentState: "draft",
        },
        select: { id: true },
      });
      assertionIds.push(assertion.id);

      // A span per assertion rather than one shared per (document, range):
      // two assertions drawn from the same sentence are two readings of it, and
      // collapsing their spans would make one adjudication silently move the
      // other's citation.
      const span = await tx.span.create({
        data: {
          documentId: a.span.documentId,
          documentVersion: a.span.documentVersion,
          startOffset: a.span.startOffset,
          endOffset: a.span.endOffset,
          excerpt: a.span.excerpt,
        },
        select: { id: true },
      });
      spansWritten += 1;

      await tx.evidence.create({
        data: { assertionId: assertion.id, spanId: span.id, stance: "supports" },
      });
      evidenceWritten += 1;

      if (a.mentions.length > 0) {
        const { count } = await tx.assertionMention.createMany({
          data: a.mentions.map((name) => ({
            assertionId: assertion.id,
            entityId: entityIds.get(name)!,
            role: "mentions",
          })),
          skipDuplicates: true,
        });
        mentionsWritten += count;
      }
    }

    return { assertionIds, spansWritten, evidenceWritten, entitiesCreated, mentionsWritten };
  });
}

/**
 * Record an adjudicated conflict: `loser` is superseded by `winner`, and the
 * losing side gains a `contradicts` edge naming the winner.
 *
 * The loser is NOT deleted. "What did we believe, and what did it replace" is
 * exactly the question a superseded row exists to answer, and an agent that
 * cited the old value before the adjudication needs to be able to find out what
 * happened to it.
 */
// NOT CALLED IN PRODUCTION YET - same reason as `conflictCandidates`: the
// adjudication surface is deferred. See 140 section 11.3.
export async function recordConflictOutcome(winnerId: string, loserId: string): Promise<void> {
  const p = await getPrismaClient();
  await p.$transaction(async (tx) => {
    await tx.assertion.update({
      where: { id: loserId },
      data: { supersededById: winnerId, updatedAt: new Date() },
    });
    await tx.evidence.create({
      data: { assertionId: loserId, supportsId: winnerId, stance: "contradicts" },
    });
  });
}

/**
 * Scope for a sweep. `"all"` is spelled out rather than expressed by leaving an
 * argument off, because the two mistakes are not symmetric: sweeping nothing
 * when you meant everything is a no-op you notice, and sweeping EVERYTHING when
 * you meant one workspace tombstones another tenant's assertions. An empty array
 * therefore means exactly what it says - nothing - and the dangerous case cannot
 * happen by forgetting a parameter.
 */
export type SweepScope = string[] | "all";

export interface UngroundedSweep {
  scanned: number;
  tombstoned: number;
}

/**
 * Assertions that have lost every piece of evidence, tombstoned.
 *
 * The write-side half of 140-assertion-model §7. KD-206 rules that a deletion
 * request means the rows must actually go, and a foreign key cannot express
 * "lost its LAST edge" - deleting a document cascades its spans and evidence
 * but leaves the assertion standing.
 *
 * This is the ASYNCHRONOUS half. The synchronous guarantee is the read-side
 * filter in `kinds.ts`: an assertion with no evidence is never served, whether
 * or not this has run. Relying on this sweep alone would leave ungrounded
 * assertions citable until it next fired - which is why the read filter shipped
 * first and this one is allowed to run on a schedule.
 */
export async function sweepUngrounded(scope: SweepScope): Promise<UngroundedSweep> {
  if (scope !== "all" && scope.length === 0) return { scanned: 0, tombstoned: 0 };
  const p = await getPrismaClient();
  // `none: { stance: "supports" }`, not `none: {}`. An adjudication loser keeps
  // a `contradicts` edge naming the winner, and that edge points at an
  // ASSERTION rather than a span - so it survives the document deletion that
  // took the loser's actual grounds away. Counting all evidence left it looking
  // grounded; a live probe caught exactly that, one row surviving a sweep it
  // should not have.
  const orphaned = await p.assertion.findMany({
    where: {
      ...(scope === "all" ? {} : { kbId: { in: scope } }),
      contentState: { notIn: ["deleted"] },
      evidence: { none: { stance: "supports" } },
    },
    select: { id: true },
  });
  if (orphaned.length === 0) return { scanned: 0, tombstoned: 0 };

  const { count } = await p.assertion.updateMany({
    where: { id: { in: orphaned.map((a) => a.id) } },
    data: { contentState: "deleted", updatedAt: new Date() },
  });
  return { scanned: orphaned.length, tombstoned: count };
}
