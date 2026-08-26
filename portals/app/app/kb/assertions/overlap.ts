// The bridge between a citation and the assertions it rests on.
//
// A citation identifies a CHUNK; an assertion is anchored to a SPAN. Both index
// into the same canonical document text (kb/processing/ir.ts `canonicalText`),
// so the relation between them is arithmetic rather than a heuristic - which is
// the whole reason chunks were given a source range.
//
// Pure, and separated from the query, because the interesting part is the edge
// cases: a range that only touches, a range that is unknown, a span from a
// different version of the same document.

import type { SourceRange } from "../processing/ir";

/** A chunk's recorded range. NULL offsets mean UNKNOWN - a chunk written before
 *  the range existed - and are never treated as 0. */
export interface ChunkRange {
  chunkId: string;
  documentId: string;
  documentVersion: number;
  startOffset: number | null;
  endOffset: number | null;
}

export interface SpanRange {
  spanId: string;
  documentId: string;
  documentVersion: number;
  startOffset: number;
  endOffset: number;
}

/**
 * Do two half-open ranges share at least one character?
 *
 * Half-open on both sides, so `[0,10)` and `[10,20)` are ADJACENT, not
 * overlapping. That distinction matters: a chunk boundary that happens to abut
 * a span would otherwise pull in an assertion the citation does not actually
 * contain.
 */
export function rangesOverlap(a: SourceRange, b: SourceRange): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * The spans a citation covers.
 *
 * Three conditions, all necessary:
 *   - same document - obviously;
 *   - same VERSION - a span from version 3 describes text that version 4 may no
 *     longer contain, and matching across versions would attribute an assertion
 *     to a passage that never said it;
 *   - overlapping ranges.
 *
 * A chunk with unknown offsets matches NOTHING. That is deliberate: the
 * alternative - falling back to "every span in the document" - would silently
 * turn a precise question into a document-level one, and the caller would have
 * no way to tell which answer it got. An empty result is legible; a quietly
 * widened one is not.
 */
export function spansForChunk(chunk: ChunkRange, spans: SpanRange[]): SpanRange[] {
  if (chunk.startOffset === null || chunk.endOffset === null) return [];
  const range = { start: chunk.startOffset, end: chunk.endOffset };
  return spans.filter(
    (s) =>
      s.documentId === chunk.documentId &&
      s.documentVersion === chunk.documentVersion &&
      rangesOverlap(range, { start: s.startOffset, end: s.endOffset }),
  );
}

/** Whether a chunk can answer the provenance question at all. Exposed so a
 *  caller can say "this citation predates source ranges" instead of "no
 *  evidence", which are different facts and must not read the same. */
export function hasSourceRange(chunk: ChunkRange): boolean {
  return chunk.startOffset !== null && chunk.endOffset !== null;
}
