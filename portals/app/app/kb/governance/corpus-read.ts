import { getPrismaClient } from "../../lib/db";
import type { VerificationState } from "../demo/evaluation-types";

// The 验证治理 read model - the corpus half of 验证评测.
//
// FIRST of the four portal domains to come off the demo overlay, and it needed
// no new table: document.verification_state and entry.verification_state have
// existed since the baseline DDL (both pinned by a CHECK to exactly
// unverified / verified / stale). Everything here is queries over columns that
// were already being written.
//
// It lives in kb/governance/ rather than in a route because TWO surfaces read
// it - the 验证评测 page (/api/evaluation) and the 导航栏 card (/api/shell) -
// and a nav card that disagrees with the page it frames is worse than a nav
// card with no figures at all.
//
// Population is documents + entries in the workspace's live knowledge bases:
// the SAME population /api/overview counts for its coverage figure, so the two
// pages cannot report different coverage for the same corpus.

/** Coverage floor for the 低于覆盖基线 list. A karda default until a
 *  workspace-level policy config exists; chosen to reproduce the classification
 *  the demo overlay already showed, so the live and demo paths agree in shape
 *  rather than only in field names. */
export const COVERAGE_FLOOR_PCT = 80;

/** Assets below the floor, worst first, capped - a "look here next" list, not
 *  a report. */
export const BELOW_FLOOR_LIMIT = 5;

/** The three values the DDL allows (chk_document_verification_state /
 *  chk_entry_verification_state). Anything else is a constraint violation, not
 *  a case to carry. */
export type VerifState = "verified" | "stale" | "unverified";

export interface KbRef {
  id: string;
  name: string;
}

/** One `GROUP BY kb_id, verification_state` row, from either table. */
export interface VerifCount {
  kbId: string;
  verificationState: string;
  count: number;
}

interface KbTally {
  name: string;
  total: number;
  verified: number;
  stale: number;
}

/** Pure aggregation - separated from the query so it can be tested without a
 *  database, which is the only way the edge cases below get covered at all. */
export function tallyCorpus(
  kbs: KbRef[],
  rows: VerifCount[],
  floorPct: number = COVERAGE_FLOOR_PCT,
  limit: number = BELOW_FLOOR_LIMIT,
): Omit<VerificationState, "preVerifiedPending"> {
  const tally = new Map<string, KbTally>(kbs.map((k) => [k.id, { name: k.name, total: 0, verified: 0, stale: 0 }]));
  for (const row of rows) {
    const t = tally.get(row.kbId);
    if (!t) continue; // a row under a kb outside the population (deleted, other ws)
    t.total += row.count;
    if (row.verificationState === "verified") t.verified += row.count;
    else if (row.verificationState === "stale") t.stale += row.count;
  }

  let verified = 0;
  let stale = 0;
  let total = 0;
  const belowFloor: VerificationState["belowFloor"] = [];
  for (const t of tally.values()) {
    verified += t.verified;
    stale += t.stale;
    total += t.total;
    // An empty asset has no coverage to be below. Listing it at 0% would put
    // every freshly created library at the top of the "look here" list and
    // bury the ones that actually regressed.
    if (t.total === 0) continue;
    const pct = Math.round((t.verified / t.total) * 100);
    if (pct < floorPct) belowFloor.push({ name: t.name, coveragePct: pct, staleCount: t.stale });
  }
  belowFloor.sort((a, b) => a.coveragePct - b.coveragePct || a.name.localeCompare(b.name));

  return {
    verified,
    stale,
    unverified: total - verified - stale,
    coveragePct: total === 0 ? 0 : Math.round((verified / total) * 100),
    floorPct,
    belowFloor: belowFloor.slice(0, limit),
  };
}

/** Read the corpus half out of the DB. Caller must have checked prismaEnabled(). */
export async function readCorpus(workspaceId: string): Promise<Omit<VerificationState, "preVerifiedPending">> {
  const p = await getPrismaClient();
  const kbs = await p.knowledgeBase.findMany({
    where: { workspaceId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const kbIds = kbs.map((k) => k.id);

  const [docVerifs, entryVerifs] = await Promise.all([
    p.document.groupBy({ by: ["kbId", "verificationState"], where: { kbId: { in: kbIds } }, _count: { _all: true } }),
    p.entry.groupBy({ by: ["kbId", "verificationState"], where: { kbId: { in: kbIds } }, _count: { _all: true } }),
  ]);

  const rows: VerifCount[] = [...docVerifs, ...entryVerifs].map((r) => ({
    kbId: r.kbId,
    verificationState: r.verificationState,
    count: r._count._all,
  }));
  return tallyCorpus(kbs, rows);
}
