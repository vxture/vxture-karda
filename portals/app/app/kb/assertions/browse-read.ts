// `karda.browse` - what is in this library at all.
//
// The other five read tools all start from something the caller already has: a
// query, a citation, an entity name. Browse starts from nothing but a library
// id, and that is the point. An agent deciding whether to ATTACH a library
// cannot search its way to that decision - a query that returns nothing might
// mean the library is irrelevant or might mean the agent guessed the wrong
// words, and those two look identical from the outside. Browse is the only tool
// that can answer "is there anything in here about my domain" honestly.
//
// It is also the tool a steward uses to audit what extraction actually produced,
// which is why it lists assertions and entities rather than documents: documents
// are what we ingested, assertions are what we claim to KNOW, and only the
// second one is checkable.

import { isRecallable } from "./kinds";

/** What a browse call enumerates. Two shapes, one tool: same library, same
 *  permission, same pagination - splitting them would duplicate all three. */
export type BrowseTarget = "assertions" | "entities";

/** How many rows one page may carry. */
export const DEFAULT_PAGE = 25;
export const MAX_PAGE = 100;

export interface BrowseAssertion {
  assertionId: string;
  kind: string;
  subject: string | null;
  statement: string;
  assertedBy: string | null;
  asOf: string | null;
  verificationState: string;
  supportingEvidenceCount: number;
}

export interface BrowseEntity {
  entityId: string;
  name: string;
  kind: string;
  aliases: string[];
  /** How many recallable assertions mention it. The one number that says
   *  whether this entity is a thing the library actually knows about or a name
   *  that was extracted once and never corroborated. */
  assertionCount: number;
}

export interface BrowsePage<T> {
  kbId: string;
  target: BrowseTarget;
  items: T[];
  /** Opaque. Pass it back verbatim to continue; absent means the end. */
  nextCursor: string | null;
}

// --- the cursor -------------------------------------------------------------

/**
 * A keyset cursor over `(createdAt, id)`, not an offset.
 *
 * An offset is wrong here for a reason specific to this corpus: it is being
 * written to while it is being read. Ingestion adds rows at the top, and with
 * `OFFSET 25` every insert between page 1 and page 2 pushes one unseen row down
 * past the boundary - the caller never sees it and nothing reports that it was
 * skipped. A keyset asks for "the rows after THIS one", so concurrent inserts
 * simply do not participate.
 *
 * Opaque on purpose: the caller must not construct one. It is base64 of an
 * internal ordering key, and a hand-built cursor would be a way to ask for rows
 * by position in a table the caller cannot otherwise address.
 */
export interface CursorKey {
  createdAt: string;
  id: string;
}

export function encodeCursor(key: CursorKey): string {
  return Buffer.from(`${key.createdAt}|${key.id}`, "utf-8").toString("base64url");
}

/**
 * Decode a cursor, or null if it is not one.
 *
 * Null rather than throw: a malformed cursor means "start from the beginning",
 * because the alternative - failing the call - turns a stale bookmark into an
 * error the agent has no way to act on. A cursor from ANOTHER library decodes
 * fine and is harmless: the query is scoped by kb id and visible set either way,
 * so it simply selects nothing.
 */
export function decodeCursor(raw: unknown): CursorKey | null {
  if (typeof raw !== "string" || raw === "") return null;
  let text: string;
  try {
    text = Buffer.from(raw, "base64url").toString("utf-8");
  } catch {
    return null;
  }
  const at = text.lastIndexOf("|");
  if (at <= 0) return null;
  const createdAt = text.slice(0, at);
  const id = text.slice(at + 1);
  if (id === "" || Number.isNaN(Date.parse(createdAt))) return null;
  return { createdAt, id };
}

/** Clamp a caller-supplied page size. Unreadable input is the default, never an
 *  error - the same rule `get_context`'s radius follows. */
export function clampPage(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_PAGE;
  return Math.max(1, Math.min(MAX_PAGE, Math.floor(n)));
}

// --- shaping ----------------------------------------------------------------

/** One row as the store hands it back. */
export interface AssertionRow extends BrowseAssertion {
  contentState: string;
  supersededById: string | null;
  createdAt: string;
}

/**
 * Shape a page of assertions.
 *
 * The recallable filter applies here exactly as it does in `find_entity` and
 * retrieval. Browse is the tool most likely to be argued into an exception -
 * "it is for auditing, show everything" - and that argument is wrong on this
 * surface: the Console is where a steward audits drafts, with a session and an
 * identity. An agent tool that served what retrieval refuses would be the back
 * door, whatever we called it.
 *
 * A consequence worth stating rather than discovering: freshly extracted
 * assertions land as `draft`, so a library whose extraction just ran browses as
 * EMPTY until adjudication promotes them. That is correct - nothing has been
 * confirmed yet - but it means an empty page does not imply an empty library.
 */
export function shapeAssertions(
  kbId: string,
  rows: AssertionRow[],
  pageSize: number,
): BrowsePage<BrowseAssertion> {
  const kept = rows.filter((r) =>
    isRecallable({
      contentState: r.contentState,
      supportingEvidenceCount: r.supportingEvidenceCount,
      supersededById: r.supersededById,
    }),
  );
  return page(kbId, "assertions", rows, kept, pageSize, (r) => r.assertionId, ({ contentState: _c, supersededById: _s, createdAt: _d, ...rest }) => rest);
}

export interface EntityRow extends BrowseEntity {
  createdAt: string;
}

/**
 * Shape a page of entities.
 *
 * An entity with zero recallable assertions is dropped. It is not junk - the
 * registry keeps entities that lost all their mentions on purpose (140 §7) -
 * but listing it here would answer "what does this library know about" with a
 * name it knows nothing about.
 */
export function shapeEntities(kbId: string, rows: EntityRow[], pageSize: number): BrowsePage<BrowseEntity> {
  const kept = rows.filter((r) => r.assertionCount > 0);
  return page(kbId, "entities", rows, kept, pageSize, (r) => r.entityId, ({ createdAt: _d, ...rest }) => rest);
}

/**
 * Build the page envelope.
 *
 * THE CURSOR COMES FROM THE LAST FETCHED ROW, NOT THE LAST KEPT ONE. The store
 * fetches `pageSize + 1` rows and the filters above may drop any of them; if the
 * cursor pointed at the last SURVIVING row, every row the filter dropped after
 * it would be re-fetched and re-dropped on the next page, forever, and a library
 * whose tail is all drafts would page without ever terminating.
 */
function page<Row extends { createdAt: string }, Out>(
  kbId: string,
  target: BrowseTarget,
  fetched: Row[],
  kept: Row[],
  pageSize: number,
  idOf: (r: Row) => string,
  strip: (r: Row) => Out,
): BrowsePage<Out> {
  const hasMore = fetched.length > pageSize;
  const window = fetched.slice(0, pageSize);
  const last = window[window.length - 1];
  const inWindow = new Set(window);
  return {
    kbId,
    target,
    items: kept.filter((r) => inWindow.has(r)).map(strip),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: idOf(last) }) : null,
  };
}

/** Nothing to show - or nothing the caller may see. Identical either way, the
 *  same rule the other three read tools follow. */
export function emptyPage<T>(kbId: string, target: BrowseTarget): BrowsePage<T> {
  return { kbId, target, items: [], nextCursor: null };
}
