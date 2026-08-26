import { test } from "node:test";
import assert from "node:assert/strict";
import { rangesOverlap, spansForChunk, hasSourceRange, type ChunkRange, type SpanRange } from "./overlap";
import { parseFastPath, canonicalText } from "../processing/ir";
import { chunkGeneral } from "../processing/chunk";

const chunk = (over: Partial<ChunkRange> = {}): ChunkRange => ({
  chunkId: "c1",
  documentId: "doc-1",
  documentVersion: 4,
  startOffset: 100,
  endOffset: 200,
  ...over,
});

const span = (over: Partial<SpanRange> = {}): SpanRange => ({
  spanId: "s1",
  documentId: "doc-1",
  documentVersion: 4,
  startOffset: 150,
  endOffset: 160,
  ...over,
});

// --- the arithmetic -------------------------------------------------------------

test("half-open ranges that merely touch do NOT overlap", () => {
  // A chunk boundary abutting a span would otherwise pull in an assertion the
  // citation does not actually contain.
  assert.equal(rangesOverlap({ start: 0, end: 10 }, { start: 10, end: 20 }), false);
  assert.equal(rangesOverlap({ start: 0, end: 11 }, { start: 10, end: 20 }), true);
});

test("containment in either direction overlaps", () => {
  assert.equal(rangesOverlap({ start: 0, end: 100 }, { start: 40, end: 50 }), true);
  assert.equal(rangesOverlap({ start: 40, end: 50 }, { start: 0, end: 100 }), true);
});

// --- the join -------------------------------------------------------------------

test("a citation resolves to the spans it covers", () => {
  const spans = [span({ spanId: "in" }), span({ spanId: "out", startOffset: 900, endOffset: 950 })];
  assert.deepEqual(spansForChunk(chunk(), spans).map((s) => s.spanId), ["in"]);
});

test("a span from another VERSION of the same document never matches", () => {
  // Version 3's offsets describe text version 4 may no longer contain; matching
  // across versions would attribute an assertion to a passage that never said it.
  const spans = [span({ spanId: "v3", documentVersion: 3 })];
  assert.deepEqual(spansForChunk(chunk(), spans), []);
});

test("a span from another document never matches", () => {
  assert.deepEqual(spansForChunk(chunk(), [span({ documentId: "doc-2" })]), []);
});

test("a chunk with unknown offsets matches NOTHING rather than everything", () => {
  // The tempting fallback - "return every span in the document" - would turn a
  // precise question into a document-level one with no way for the caller to
  // tell which answer it got. An empty result is legible; a widened one is not.
  const spans = [span(), span({ spanId: "s2", startOffset: 0, endOffset: 5000 })];
  assert.deepEqual(spansForChunk(chunk({ startOffset: null, endOffset: null }), spans), []);
  assert.equal(hasSourceRange(chunk({ startOffset: null, endOffset: null })), false);
  assert.equal(hasSourceRange(chunk()), true);
});

// --- end to end through the real parser and chunker -----------------------------

test("chunk ranges are real slices of the canonical text", () => {
  // The property that makes the whole bridge trustworthy: what a chunk says it
  // covers must actually be in the document at those offsets.
  const raw = [
    "# Operations",
    "",
    "One sortie lasts 25 minutes in light rain.",
    "",
    "## Limits",
    "",
    "No flight is permitted above 10 m/s.",
  ].join("\r\n"); // CRLF on purpose - normalisation must not shift the offsets

  const text = canonicalText(raw);
  const chunks = chunkGeneral(parseFastPath(raw));
  assert.ok(chunks.length > 0);

  for (const c of chunks) {
    assert.ok(c.sourceRange.end > c.sourceRange.start, "every chunk has a real range");
    assert.ok(c.sourceRange.end <= text.length, "no range runs past the document");
    const slice = text.slice(c.sourceRange.start, c.sourceRange.end);
    assert.ok(slice.trim().length > 0, "a chunk's range must quote something");
  }
});

test("an assertion span inside a paragraph resolves to the chunk containing it", () => {
  const raw = "# Operations\n\nOne sortie lasts 25 minutes in light rain.\n\n## Limits\n\nNo flight above 10 m/s.";
  const text = canonicalText(raw);
  const chunks = chunkGeneral(parseFastPath(raw));

  // The extractor would report this range for the sortie statement.
  const at = text.indexOf("One sortie lasts 25 minutes");
  const s: SpanRange = {
    spanId: "sortie",
    documentId: "doc-1",
    documentVersion: 1,
    startOffset: at,
    endOffset: at + "One sortie lasts 25 minutes in light rain.".length,
  };

  const matching = chunks
    .map((c, i) => ({
      chunkId: `c${i}`,
      documentId: "doc-1",
      documentVersion: 1,
      startOffset: c.sourceRange.start,
      endOffset: c.sourceRange.end,
    }))
    .filter((c) => spansForChunk(c, [s]).length > 0);

  assert.ok(matching.length > 0, "the statement must resolve to at least one chunk");
  for (const c of matching) {
    assert.ok(
      text.slice(c.startOffset, c.endOffset).includes("One sortie"),
      "a chunk that claims this span must actually contain the sentence",
    );
  }
});
