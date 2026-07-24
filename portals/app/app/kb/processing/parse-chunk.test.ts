import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFastPath, parsePathFor, FAST_PATH_PARSER_VERSION } from "./ir";
import { chunkGeneral, estimateTokens, DEFAULT_CHUNK_PARAMS } from "./chunk";

// --- fast-path parser --------------------------------------------------------

test("mime routing sends text to fast path, everything else to deep", () => {
  assert.equal(parsePathFor("text/markdown"), "fast");
  assert.equal(parsePathFor("text/plain"), "fast");
  assert.equal(parsePathFor("text/html"), "fast");
  assert.equal(parsePathFor("application/pdf"), "deep");
  assert.equal(parsePathFor("image/png"), "deep");
});

test("headings build a running section path onto their descendants", () => {
  const ir = parseFastPath("# A\n\nintro\n\n## B\n\nunder b\n\n# C\n\nunder c");
  assert.equal(ir.parserVersion, FAST_PATH_PARSER_VERSION);
  const para = (t: string) => ir.elements.find((e) => e.type === "paragraph" && e.text === t)!;
  assert.deepEqual(para("intro").sectionPath, ["A"]);
  assert.deepEqual(para("under b").sectionPath, ["A", "B"]);
  // a same-or-shallower heading pops the stack
  assert.deepEqual(para("under c").sectionPath, ["C"]);
});

test("list items, fenced code and paragraphs are distinct element types", () => {
  const ir = parseFastPath("para one\n\n- item a\n- item b\n\n```\ncode line\n```\n\npara two");
  const types = ir.elements.map((e) => e.type);
  assert.ok(types.includes("paragraph"));
  assert.ok(types.includes("list_item"));
  assert.ok(types.includes("code"));
  const code = ir.elements.find((e) => e.type === "code")!;
  assert.equal(code.text, "code line");
});

test("blank lines separate paragraphs; wrapped lines join", () => {
  const ir = parseFastPath("line one\nline two\n\nsecond para");
  const paras = ir.elements.filter((e) => e.type === "paragraph");
  assert.equal(paras.length, 2);
  assert.equal(paras[0].text, "line one line two");
});

test("element ordinals are monotonic - the locator source for citations", () => {
  const ir = parseFastPath("# H\n\np1\n\np2");
  const ords = ir.elements.map((e) => e.locator.ordinal);
  assert.deepEqual(ords, [...ords].sort((a, b) => a - b));
  assert.equal(new Set(ords).size, ords.length, "ordinals are unique");
});

// --- chunking ----------------------------------------------------------------

test("token estimate is zero for empty and counts words otherwise", () => {
  assert.equal(estimateTokens(""), 0);
  assert.equal(estimateTokens("   "), 0);
  assert.equal(estimateTokens("one two three"), 3);
});

test("a chunk carries its section path as a contextual prefix", () => {
  const ir = parseFastPath("# Setup\n\n## Prereqs\n\nyou need node");
  const chunks = chunkGeneral(ir);
  assert.equal(chunks.length >= 1, true);
  const withBody = chunks.find((c) => c.text.includes("you need node"))!;
  assert.ok(withBody.text.startsWith("Setup > Prereqs\n"), withBody.text);
});

test("chunks respect the target size and never exceed max via oversized split", () => {
  // one huge paragraph, well over max
  const big = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(" ");
  const ir = parseFastPath(`# T\n\n${big}`);
  const chunks = chunkGeneral(ir, DEFAULT_CHUNK_PARAMS);
  assert.ok(chunks.length > 1, "an oversized element must split");
  for (const c of chunks) {
    // allow the prefix a little slack, but no chunk should be wildly over max
    assert.ok(c.tokenCount <= DEFAULT_CHUNK_PARAMS.maxTokens + 10, `chunk ${c.ordinal} = ${c.tokenCount} tokens`);
  }
});

test("a wall of words with no sentence breaks still respects max", () => {
  // Regression: sentence-splitting cannot break "word0 word1 ..." (one sentence),
  // so an unpunctuated document once produced a single 3000-token chunk. The
  // hard word-split backstop must cap it.
  const wall = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(" ");
  const ir = parseFastPath(`# T\n\n${wall}`);
  const chunks = chunkGeneral(ir, DEFAULT_CHUNK_PARAMS);
  assert.ok(chunks.length >= 3, "must split into several chunks");
  for (const c of chunks) {
    assert.ok(c.tokenCount <= DEFAULT_CHUNK_PARAMS.maxTokens + 10, `chunk ${c.ordinal} = ${c.tokenCount}`);
  }
});

test("a section boundary flushes the current chunk", () => {
  const ir = parseFastPath("# A\n\nshort a\n\n# B\n\nshort b");
  const chunks = chunkGeneral(ir);
  // 'short a' and 'short b' are under different sections, so not merged
  const aChunk = chunks.find((c) => c.text.includes("short a"))!;
  assert.ok(!aChunk.text.includes("short b"), "different sections must not share a chunk");
});

test("no empty chunks are produced", () => {
  const ir = parseFastPath("# H\n\n\n\n\n\ntext");
  const chunks = chunkGeneral(ir);
  for (const c of chunks) assert.ok(c.text.trim().length > 0);
});

test("chunk ordinals are contiguous from zero", () => {
  const ir = parseFastPath("# H\n\np1\n\np2\n\np3");
  const chunks = chunkGeneral(ir, { targetTokens: 1, maxTokens: 10, overlap: 0 });
  assert.deepEqual(chunks.map((c) => c.ordinal), chunks.map((_, i) => i));
});
