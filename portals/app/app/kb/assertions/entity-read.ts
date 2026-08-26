// `karda.find_entity` - what the corpus knows about a thing.
//
// The question this answers is not "find me documents mentioning X" (that is
// search) but "what do we KNOW about X, and according to whom". It is the first
// tool that reads the knowledge graph rather than the retrieval mechanism, and
// it is what makes the positioning demonstrable: an agent asks about a project
// and gets back statements with sources, not passages to re-read.

import { isRecallable } from "./kinds";

/**
 * How the name was matched.
 *
 * Exact and partial are reported separately, never merged. An agent that asked
 * about 「应急管理局」 and got 「XX应急管理局」 needs to know the registry did not
 * hold what it asked for - otherwise a near-miss reads as a confirmation, which
 * is the worst way for a knowledge tool to be wrong.
 */
export type EntityMatch = "exact" | "partial";

export interface EntityAssertion {
  assertionId: string;
  kind: string;
  statement: string;
  assertedBy: string | null;
  asOf: string | null;
  validUntil: string | null;
  verificationState: string;
  /** Set when a conflict was adjudicated and this statement lost. Kept in the
   *  answer rather than filtered out: "we used to believe X, now we believe Y"
   *  is information, and hiding it would let an agent re-derive the old value
   *  from an older citation without ever learning it had been replaced. */
  supersededBy: string | null;
  role: string;
}

export interface EntityHit {
  entityId: string;
  kbId: string;
  name: string;
  kind: string;
  aliases: string[];
  match: EntityMatch;
  assertions: EntityAssertion[];
}

export interface FindEntityResult {
  query: string;
  /** `exact` when at least one entity matched by name or alias outright;
   *  `partial` when nothing did and these are contains-matches instead. */
  match: EntityMatch | null;
  entities: EntityHit[];
}

/** One row as the store hands it back, before any of the rules below apply. */
export interface EntityCandidateRow {
  entityId: string;
  kbId: string;
  name: string;
  kind: string;
  aliases: string[];
  assertions: (EntityAssertion & { contentState: string; supportingEvidenceCount: number })[];
}

function matchesExactly(row: { name: string; aliases: string[] }, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (row.name.trim().toLowerCase() === needle) return true;
  return row.aliases.some((a) => a.trim().toLowerCase() === needle);
}

/**
 * Shape a lookup.
 *
 * EXACT MATCHES WIN OUTRIGHT. If any entity matched by name or alias, the
 * partial ones are dropped entirely rather than listed after them - a ranked
 * mixture would put the agent in the position of deciding which of our matches
 * to trust, which is our job, not its.
 *
 * Assertions are ordered by `as_of`, newest first, with undated ones last. Not
 * by verification and not by confidence: the question is "what do we know about
 * this thing", and the answer's natural axis is time. Sorting by quality would
 * bury a fresh unverified fact under a stale verified one, which is exactly
 * backwards for an agent trying to act on current information.
 */
export function shapeEntities(query: string, rows: EntityCandidateRow[]): FindEntityResult {
  const withMatch = rows.map((r) => ({ row: r, exact: matchesExactly(r, query) }));
  const anyExact = withMatch.some((w) => w.exact);
  const kept = anyExact ? withMatch.filter((w) => w.exact) : withMatch;

  const entities = kept.map<EntityHit>(({ row, exact }) => ({
    entityId: row.entityId,
    kbId: row.kbId,
    name: row.name,
    kind: row.kind,
    aliases: row.aliases,
    match: exact ? "exact" : "partial",
    assertions: row.assertions
      // The read-side invariant, applied here too: an assertion with no
      // supporting evidence has no grounds, and this tool must not become the
      // back door that serves what retrieval refuses.
      .filter((a) =>
        isRecallable({
          contentState: a.contentState,
          supportingEvidenceCount: a.supportingEvidenceCount,
          // NOT passed: a superseded assertion is still shown here, labelled.
          // `isRecallable` is about retrieval; this is about what we know.
        }),
      )
      .sort((a, b) => {
        if (a.asOf === b.asOf) return 0;
        if (a.asOf === null) return 1; // undated last
        if (b.asOf === null) return -1;
        return b.asOf.localeCompare(a.asOf); // newest first
      })
      .map(({ contentState: _c, supportingEvidenceCount: _n, ...rest }) => rest),
  }));

  return {
    query,
    match: entities.length === 0 ? null : anyExact ? "exact" : "partial",
    entities,
  };
}

/** Nothing matched - or nothing the caller may see. Identical either way, for
 *  the same reason `get_evidence` gives: otherwise one call per guess maps the
 *  entity registries of libraries the caller has no access to. */
export function noEntityMatch(query: string): FindEntityResult {
  return { query, match: null, entities: [] };
}
