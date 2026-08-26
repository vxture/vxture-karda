// `karda.get_context` - the passage a citation came from, in the source.
//
// The question: an agent holds a citation and wants to read around it, because
// one chunk rarely carries the sentence that qualifies it. It is the cheapest
// of the four widening tools and the only one that touches no assertion at all
// - Span and the chunk source range are the whole dependency.
//
// WHY NOT NEIGHBOURING CHUNKS. The obvious cheap implementation is "return
// chunk n-1, n, n+1" - one query, no object read. It is wrong, and `chunk.ts`
// says why in its own words: chunk text is "NOT a slice of the canonical text -
// the prefix is synthesised and the element content is normalised". Serving it
// as context would answer with OUR SEARCH INDEX while the agent asked for the
// document. KD-017 already settled the general form of this: chunks are an
// intermediate product, not the core model.
//
// THE ANCHOR IS NOT CALLER-CHOSEN. The caller picks the WIDTH of the window,
// never its position - the position is always the citation. That single
// restriction is what keeps an unmetered tool from being a document-read API:
// total unmetered reach is (citations the caller holds) x (2 x MAX_RADIUS), and
// citations only come from `search`/`ask`, which ARE metered.

/** Default characters of context on each side of the citation. */
export const DEFAULT_RADIUS = 500;
/** Hard cap per side. See the anchor rule above - this bounds the whole tool. */
export const MAX_RADIUS = 2000;

export type ContextStatus =
  | "ok"
  /** The chunk predates `incr/0007` and has no recorded offsets. Distinct from
   *  `source_unavailable`: the document is here, the bridge to it is not. */
  | "no_source_range"
  /** The citation belongs to a superseded chunk version. Refused rather than
   *  sliced: the stored bytes are the CURRENT ones, and reading old offsets
   *  into them would show a passage the citation never pointed at. */
  | "stale_version"
  /** No stored object - an entry-written document, or bytes already reclaimed. */
  | "source_unavailable"
  /** The bytes are not text (deep-path mime), so character offsets do not index
   *  them. Kept separate from `source_unavailable` because the fix differs:
   *  this one waits on deep parse, that one on the bytes. */
  | "not_text"
  /** The recorded range does not fit the stored text. Something changed without
   *  a version bump; refusing is the only honest answer. */
  | "source_mismatch";

export interface ContextWindow {
  /** Half-open canonical-text range of the returned window. */
  start: number;
  end: number;
  text: string;
  /** Where the citation sits INSIDE `text`, so the agent can mark it without
   *  arithmetic against document offsets it never asked about. */
  citationStartInWindow: number;
  citationEndInWindow: number;
  /** Is there more document before / after this window? An agent that cannot
   *  tell a window edge from a document edge will read a truncated sentence as
   *  the end of the argument. */
  moreBefore: boolean;
  moreAfter: boolean;
}

export interface ContextResult {
  citationId: string;
  status: ContextStatus;
  documentId: string | null;
  version: number | null;
  /** The citation's own range in the canonical text; null unless `status` is ok. */
  citationRange: { start: number; end: number } | null;
  window: ContextWindow | null;
}

/** Nothing found - or nothing the caller may see. Identical either way, the same
 *  rule `get_evidence` and `find_entity` follow: otherwise one call per guess
 *  turns provenance tooling into an id-enumeration oracle. */
export function contextNotFound(citationId: string): ContextResult {
  return { citationId, status: "source_unavailable", documentId: null, version: null, citationRange: null, window: null };
}

export function contextRefusal(
  citationId: string,
  status: Exclude<ContextStatus, "ok">,
  documentId: string | null,
  version: number | null,
): ContextResult {
  return { citationId, status, documentId, version, citationRange: null, window: null };
}

/** Clamp a caller-supplied radius. An absent or unparseable value is the
 *  default, not an error - the tool's job is to answer, and there is no reading
 *  of "radius: banana" that should cost the caller its citation. */
export function clampRadius(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return DEFAULT_RADIUS;
  return Math.max(0, Math.min(MAX_RADIUS, Math.floor(n)));
}

/**
 * Snap a window edge outward to a line boundary.
 *
 * Cutting at an arbitrary character hands the agent half a sentence, and half a
 * sentence read as a whole one is a provenance failure, not a cosmetic one.
 * Line boundaries rather than word boundaries ON PURPOSE: Chinese text has no
 * spaces, so word-snapping would work in English and silently do nothing in the
 * corpus this platform actually serves. Lines are language-neutral.
 *
 * Outward, and bounded: the snap may extend the window by at most `slack`
 * characters, so a document with no newlines at all (one long line) cannot turn
 * a bounded window into a whole-document read.
 */
export function snapOutward(text: string, start: number, end: number, slack: number): { start: number; end: number } {
  let s = start;
  const floor = Math.max(0, start - slack);
  while (s > floor && text[s - 1] !== "\n") s -= 1;
  if (s > 0 && text[s - 1] !== "\n") s = start; // no boundary within slack - leave it

  let e = end;
  const ceil = Math.min(text.length, end + slack);
  while (e < ceil && text[e] !== "\n") e += 1;
  if (e < text.length && text[e] !== "\n") e = end;

  return { start: s, end: e };
}

/**
 * Build the window around a citation range in the canonical text.
 *
 * Returns `source_mismatch` when the recorded range does not fit the text. That
 * is a refusal rather than a best-effort slice: an out-of-range end means these
 * bytes are not the bytes the offsets were measured against, and a short slice
 * would look like a real passage while being an arbitrary one.
 */
export function buildContext(
  citationId: string,
  documentId: string,
  version: number,
  canonical: string,
  range: { start: number; end: number },
  radius: number,
): ContextResult {
  if (range.start < 0 || range.end > canonical.length || range.end < range.start) {
    return contextRefusal(citationId, "source_mismatch", documentId, version);
  }

  const rough = { start: Math.max(0, range.start - radius), end: Math.min(canonical.length, range.end + radius) };
  // Snap slack is a fraction of the radius, not another free allowance: at
  // radius 0 the caller asked for the citation itself and gets exactly that.
  const slack = Math.floor(radius / 4);
  const snapped = snapOutward(canonical, rough.start, rough.end, slack);

  return {
    citationId,
    status: "ok",
    documentId,
    version,
    citationRange: { start: range.start, end: range.end },
    window: {
      start: snapped.start,
      end: snapped.end,
      text: canonical.slice(snapped.start, snapped.end),
      citationStartInWindow: range.start - snapped.start,
      citationEndInWindow: range.end - snapped.start,
      moreBefore: snapped.start > 0,
      moreAfter: snapped.end < canonical.length,
    },
  };
}
