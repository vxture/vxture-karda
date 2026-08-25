import { getPrismaClient } from "../../lib/db";
import { governanceApplies, type GovernancePolicy } from "../lib/state";
import { policyForKb } from "./policy";
import type { KnowledgeBaseRow } from "../lib/store";

// The re-verification WORK QUEUE - batch 11's spine.
//
// 验证评测 could already count the stale set; it could not hand you the items.
// This turns the number into a list you work through, which is the whole
// difference between a dashboard and a workbench.
//
// TWO RULES SHAPE THE LIST, and both are about not wasting the operator's time:
//
//   1. STALE LEADS UNVERIFIED. A stale item is a REGRESSION - it was trusted,
//      the clock ran out, and it has silently dropped out of the default recall
//      tier. An unverified item was never trusted, so nothing broke. Sorting by
//      age alone buries the regressions under the backlog.
//
//   2. ONLY ROWS THE VERIFY BUTTON WILL ACCEPT. GovernanceService refuses a
//      verify when the library has governance off (`governance_off`) or when the
//      item is connector-synced and the library exempts synced content
//      (`governance_exempt`). Listing those rows would put a button in front of
//      the operator that is guaranteed to fail - the exact "looks actionable but
//      isn't" failure the batch-11 plan calls out for the steward queue. So the
//      same `governanceApplies` predicate the service enforces is applied here,
//      rather than a second copy of the rule that can drift from it.
//
// Population is the workspace's live libraries - the same population
// corpus-read.ts counts, so the queue length and the 待复验 figure on the same
// page cannot disagree.

/** One row of work. Deliberately carries the library name and id: the operator
 *  is working across libraries, and "which library is this from" is the first
 *  thing they need in order to judge an item. */
export interface QueueItem {
  kind: "document" | "entry";
  id: string;
  kbId: string;
  kbName: string;
  /** Nullable because an ENTRY may genuinely have none - entries are
   *  field-based content-template rows, and the title is optional. The UI shows
   *  a neutral placeholder; inventing a title here would be a lie in a list
   *  whose whole job is helping someone judge an item. */
  title: string | null;
  verificationState: "stale" | "unverified";
  /** Last verification, when there was one. A stale item always has these; an
   *  unverified item never does. */
  verifier: string | null;
  verifiedAt: string | null;
  /** When it lapsed (stale) - null for unverified. */
  expiresAt: string | null;
  /** Only for documents: connector-synced content reads differently, and the
   *  operator should know a row came from outside before re-verifying it. */
  source: string | null;
}

export interface QueueResult {
  items: QueueItem[];
  /** Totals for the WHOLE eligible queue, not the returned page - an operator
   *  needs to know whether they are 12 items from done or 1,200. */
  staleTotal: number;
  unverifiedTotal: number;
  /** True when more eligible items exist than were returned. */
  truncated: boolean;
}

/** A page of work, not a report. Large enough to keep working, small enough to
 *  render as rows with real controls on each. */
export const QUEUE_LIMIT = 50;

interface RawItem {
  kind: "document" | "entry";
  id: string;
  kbId: string;
  title: string | null;
  verificationState: string;
  verifier: string | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  source: string | null;
}

/**
 * Pure ordering + eligibility, separated from the query so the rules above are
 * testable without a database. `policies` maps kb id -> resolved policy; a kb
 * absent from the map is outside the population and its rows are dropped.
 */
export function buildQueue(
  kbs: Pick<KnowledgeBaseRow, "id" | "name">[],
  policies: Map<string, GovernancePolicy>,
  rows: RawItem[],
  limit: number = QUEUE_LIMIT,
): QueueResult {
  const names = new Map(kbs.map((k) => [k.id, k.name]));

  const eligible: QueueItem[] = [];
  for (const row of rows) {
    const policy = policies.get(row.kbId);
    const name = names.get(row.kbId);
    if (!policy || name === undefined) continue;
    if (row.verificationState !== "stale" && row.verificationState !== "unverified") continue;
    // The same gate the service applies on write. See rule 2 above.
    if (!governanceApplies(policy, { synced: row.source === "connector" })) continue;

    eligible.push({
      kind: row.kind,
      id: row.id,
      kbId: row.kbId,
      kbName: name,
      title: row.title,
      verificationState: row.verificationState,
      verifier: row.verifier,
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
      expiresAt: row.expiresAt?.toISOString() ?? null,
      source: row.source,
    });
  }

  const staleTotal = eligible.filter((i) => i.verificationState === "stale").length;
  const unverifiedTotal = eligible.length - staleTotal;

  // Stale first (rule 1); within stale, the longest-lapsed first, because that
  // is the item that has been quietly missing from recall the longest. Within
  // unverified there is no clock, so fall back to a locale-free title/id order -
  // `localeCompare` orders CJK by whatever ICU collation the runtime carries and
  // would give the developer's screen and the server different lists.
  eligible.sort((a, b) => {
    if (a.verificationState !== b.verificationState) return a.verificationState === "stale" ? -1 : 1;
    if (a.verificationState === "stale") {
      const ax = a.expiresAt ?? "";
      const bx = b.expiresAt ?? "";
      if (ax !== bx) return ax < bx ? -1 : 1;
    }
    // Untitled entries sort last within their group rather than first, which is
    // where an empty string would put them.
    const at = a.title ?? "￿";
    const bt = b.title ?? "￿";
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return {
    items: eligible.slice(0, limit),
    staleTotal,
    unverifiedTotal,
    truncated: eligible.length > limit,
  };
}

/**
 * Read the queue for a workspace, optionally narrowed to one library - which is
 * what makes the 低于覆盖基线 list on 验证评测 a way in rather than a dead end.
 *
 * Caller must have checked prismaEnabled().
 */
export async function readQueue(
  workspaceId: string,
  kbId?: string,
  limit: number = QUEUE_LIMIT,
): Promise<QueueResult> {
  const p = await getPrismaClient();
  const kbs = await p.knowledgeBase.findMany({
    where: { workspaceId, deletedAt: null, ...(kbId ? { id: kbId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (kbs.length === 0) return { items: [], staleTotal: 0, unverifiedTotal: 0, truncated: false };

  const kbIds = kbs.map((k) => k.id);
  const policies = new Map(kbs.map((k) => [k.id, policyForKb(k as unknown as KnowledgeBaseRow)]));

  // Over-fetch relative to `limit`: eligibility is decided in buildQueue (a
  // synced-and-exempt row is dropped there, not in SQL), so taking exactly
  // `limit` from the DB could return a short page while eligible work remains.
  const take = limit * 4;
  const where = {
    kbId: { in: kbIds },
    verificationState: { in: ["stale", "unverified"] },
    contentState: { not: "deleted" },
  };

  const [docs, entries] = await Promise.all([
    p.document.findMany({
      where,
      select: {
        id: true, kbId: true, title: true, verificationState: true,
        verifier: true, verifiedAt: true, expiresAt: true, source: true,
      },
      // stale-before-unverified is buildQueue's job; ordering by expiry here
      // just makes the over-fetch prefer the rows that will sort to the top.
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take,
    }),
    p.entry.findMany({
      where,
      select: {
        id: true, kbId: true, title: true, verificationState: true,
        verifier: true, verifiedAt: true, expiresAt: true,
      },
      orderBy: [{ expiresAt: "asc" }, { id: "asc" }],
      take,
    }),
  ]);

  const rows: RawItem[] = [
    ...docs.map((d) => ({ ...d, kind: "document" as const })),
    // Entries are authored in-product, never connector-synced (100-kb-model 4),
    // so `source: null` is a fact about entries, not a missing column.
    ...entries.map((e) => ({ ...e, kind: "entry" as const, source: null })),
  ];

  return buildQueue(kbs, policies, rows, limit);
}
