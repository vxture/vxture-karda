// The database side of `karda.find_entity`.
//
// Split from `entity-read.ts` for the same reason `evidence-store` is split
// from `evidence-read`: the rules worth arguing about - exact beats partial,
// newest first, ungrounded assertions stay out, a near miss says so - belong
// somewhere they can be tested without a Postgres.

import { getPrismaClient, prismaEnabled } from "../../lib/db";
import { shapeEntities, noEntityMatch, type EntityCandidateRow, type FindEntityResult } from "./entity-read";

/**
 * Turn a caller-supplied name into a LIKE pattern, escaping the metacharacters.
 *
 * Prisma's `contains` does NOT do this, which is why the filter below is raw
 * SQL and not a `where` clause: a caller asking about a name containing `%`
 * would otherwise have matched every entity it could see.
 */
function likePattern(q: string): string {
  return `%${q.replace(/[\%_]/g, (c) => `\${c}`)}%`;
}

/** How many entities one lookup may return. A name like 「项目」 could match
 *  hundreds; an unbounded answer would be a denial-of-service on the caller's
 *  context window rather than an answer. */
const MAX_ENTITIES = 20;
/** And how many statements per entity. Same reasoning, and the ordering
 *  (newest first) means a truncated list is still the useful end of it. */
const MAX_ASSERTIONS = 50;

/**
 * Find entities by name or alias, within the libraries the caller may see.
 *
 * Postgres does the CONTAINS filter and the visibility filter; the ranking rule
 * (exact wins outright) is applied afterwards in `shapeEntities`, on purpose. A
 * SQL `ORDER BY exact DESC` would have produced a ranked mixture, and the rule
 * is not "exact first" - it is "if any exact match exists, the partials are not
 * an answer at all".
 */
export async function findEntities(query: string, visibleKbIds: string[]): Promise<FindEntityResult> {
  const q = query.trim();
  if (!prismaEnabled() || q === "" || visibleKbIds.length === 0) return noEntityMatch(q);

  const p = await getPrismaClient();

  // Which entities are candidates: name OR any alias contains the query.
  //
  // Aliases live in JSONB, so this needs `jsonb_array_elements_text` and cannot
  // be written as a Prisma `where`. That is not an optimisation - matching only
  // on `name` left alias lookup DEAD: the alias rule in `shapeEntities` can only
  // rank rows the query already returned, so an entity found solely by its alias
  // never reached it. A live probe caught this; the unit tests could not, because
  // they hand rows to the shaping layer directly.
  //
  // `contains` on both sides, deliberately: an exact match contains itself, so
  // one predicate serves both cases and exact-versus-partial is decided ONCE, in
  // the shaping. Anything narrower here would make alias matching a different
  // predicate from name matching for no reason a caller could predict.
  //
  // The ORDER BY puts exact matches first. That is TRUNCATION order, not the
  // verdict - `shapeEntities` still decides exact-versus-partial - but the LIMIT
  // has to cut partials and never an exact match: a common word like 「项目」 has
  // plenty of entities sorting ahead of it alphabetically, and losing the exact
  // one to the window would report `partial` while an exact match sat in the
  // table.
  const pattern = likePattern(q);
  const ids = await p.$queryRaw<{ id: string }[]>`
    SELECT id FROM karda_kb.entity
    WHERE kb_id = ANY(${visibleKbIds}::uuid[])
      AND (
        name ILIKE ${pattern}
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(aliases) AS alias
          WHERE alias ILIKE ${pattern}
        )
      )
    ORDER BY
      (lower(btrim(name)) = lower(${q})
        OR EXISTS (
          SELECT 1 FROM jsonb_array_elements_text(aliases) AS alias
          WHERE lower(btrim(alias)) = lower(${q})
        )) DESC,
      name ASC
    LIMIT ${MAX_ENTITIES}
  `;
  if (ids.length === 0) return noEntityMatch(q);

  const rows = await p.entity.findMany({
    where: { id: { in: ids.map((r) => r.id) } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      kbId: true,
      name: true,
      kind: true,
      aliases: true,
      mentions: {
        take: MAX_ASSERTIONS,
        select: {
          role: true,
          assertion: {
            select: {
              id: true,
              kind: true,
              statement: true,
              assertedBy: true,
              asOf: true,
              validUntil: true,
              verificationState: true,
              supersededById: true,
              contentState: true,
              _count: { select: { evidence: { where: { stance: "supports" } } } },
            },
          },
        },
      },
    },
  });

  const candidates: EntityCandidateRow[] = rows.map((e) => ({
    entityId: e.id,
    kbId: e.kbId,
    name: e.name,
    kind: e.kind,
    aliases: Array.isArray(e.aliases) ? (e.aliases as unknown[]).filter((x): x is string => typeof x === "string") : [],
    assertions: e.mentions.map((m) => ({
      assertionId: m.assertion.id,
      kind: m.assertion.kind,
      statement: m.assertion.statement,
      assertedBy: m.assertion.assertedBy,
      asOf: m.assertion.asOf?.toISOString() ?? null,
      validUntil: m.assertion.validUntil?.toISOString() ?? null,
      verificationState: m.assertion.verificationState,
      supersededBy: m.assertion.supersededById,
      role: m.role,
      contentState: m.assertion.contentState,
      supportingEvidenceCount: m.assertion._count.evidence,
    })),
  }));

  return shapeEntities(q, candidates);
}
