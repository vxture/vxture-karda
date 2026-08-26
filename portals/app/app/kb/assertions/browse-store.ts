// The database side of `karda.browse`.
//
// Two queries, one rule they share: fetch pageSize + 1 rows so the shaping layer
// can tell "this is the last page" from "the rest was filtered out" without a
// second round trip.

import { getPrismaClient, prismaEnabled } from "../../lib/db";
import {
  shapeAssertions,
  shapeEntities,
  decodeCursor,
  emptyPage,
  type BrowsePage,
  type BrowseAssertion,
  type BrowseEntity,
  type BrowseTarget,
} from "./browse-read";

/**
 * Browse one library, for a caller who may see `visibleKbIds`.
 *
 * The visibility rule is the same one every read tool follows and is enforced
 * the same way - as part of the QUERY, not a check afterwards - so a library the
 * caller cannot see is indistinguishable from one that does not exist. Browse
 * makes that matter more than the others do: it takes a bare library id and no
 * search terms, so a distinguishable refusal would turn it into a clean oracle
 * for enumerating which library ids exist.
 */
export async function browseLibrary(
  kbId: string,
  target: BrowseTarget,
  visibleKbIds: string[],
  pageSize: number,
  cursor: unknown,
): Promise<BrowsePage<BrowseAssertion | BrowseEntity>> {
  if (!prismaEnabled() || kbId === "" || !visibleKbIds.includes(kbId)) {
    return emptyPage<BrowseAssertion | BrowseEntity>(kbId, target);
  }

  const p = await getPrismaClient();
  const key = decodeCursor(cursor);
  // Newest first, id as the tiebreak so the total order is strict: two rows
  // written in the same transaction share a createdAt to the microsecond, and
  // without the tiebreak the boundary between two pages could repeat one and
  // skip another.
  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  // Written as two always-present optional fields rather than a spread: a
  // conditional spread widens the argument to a union and Prisma's generated
  // types reject it, and `undefined` is exactly what "no cursor" means anyway.
  const cursorArg = key ? { id: key.id } : undefined;
  const skipArg = key ? 1 : undefined;
  const take = pageSize + 1;

  if (target === "entities") {
    const rows = await p.entity.findMany({
      where: { kbId },
      orderBy,
      take,
      cursor: cursorArg,
      skip: skipArg,
      select: {
        id: true,
        name: true,
        kind: true,
        aliases: true,
        createdAt: true,
        // Only mentions of assertions that are actually recallable. Counting all
        // mentions would report an entity as known on the strength of drafts and
        // adjudication losers - the two things every other read tool refuses to
        // serve.
        _count: {
          select: {
            mentions: {
              where: {
                assertion: {
                  contentState: "indexed",
                  supersededById: null,
                  evidence: { some: { stance: "supports" } },
                },
              },
            },
          },
        },
      },
    });
    return shapeEntities(
      kbId,
      rows.map((r) => ({
        entityId: r.id,
        name: r.name,
        kind: r.kind,
        aliases: Array.isArray(r.aliases) ? (r.aliases as unknown[]).filter((x): x is string => typeof x === "string") : [],
        assertionCount: r._count.mentions,
        createdAt: r.createdAt.toISOString(),
      })),
      pageSize,
    );
  }

  const rows = await p.assertion.findMany({
    where: { kbId },
    orderBy,
    take,
    cursor: cursorArg,
    skip: skipArg,
    select: {
      id: true,
      kind: true,
      subject: true,
      statement: true,
      assertedBy: true,
      asOf: true,
      verificationState: true,
      contentState: true,
      supersededById: true,
      createdAt: true,
      _count: { select: { evidence: { where: { stance: "supports" } } } },
    },
  });

  return shapeAssertions(
    kbId,
    rows.map((r) => ({
      assertionId: r.id,
      kind: r.kind,
      subject: r.subject,
      statement: r.statement,
      assertedBy: r.assertedBy,
      asOf: r.asOf?.toISOString() ?? null,
      verificationState: r.verificationState,
      supportingEvidenceCount: r._count.evidence,
      contentState: r.contentState,
      supersededById: r.supersededById,
      createdAt: r.createdAt.toISOString(),
    })),
    pageSize,
  );
}
