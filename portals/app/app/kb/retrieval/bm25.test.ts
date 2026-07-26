import { test } from "node:test";
import assert from "node:assert/strict";
import { bm25Rank, tokenize } from "./bm25";

test("tokenize lowercases and splits on non-alphanumeric", () => {
  assert.deepEqual(tokenize("Hello, World! v2"), ["hello", "world", "v2"]);
  assert.deepEqual(tokenize("  --  "), []);
});

test("a document containing the query term outranks one that does not", () => {
  const docs = [
    { id: "a", text: "the quick brown fox" },
    { id: "b", text: "lorem ipsum dolor sit amet" },
  ];
  const ranked = bm25Rank(docs, "fox");
  assert.equal(ranked.length, 1, "only the matching doc scores");
  assert.equal(ranked[0].id, "a");
});

test("a rarer query term (higher IDF) dominates a common one", () => {
  // "common" appears in every doc (idf ~ 0); "rare" appears in one.
  const docs = [
    { id: "a", text: "common common common" },
    { id: "b", text: "common rare" },
    { id: "c", text: "common word here" },
  ];
  const ranked = bm25Rank(docs, "common rare");
  assert.equal(ranked[0].id, "b", "the doc with the rare term ranks first");
});

test("length normalisation: with equal term frequency, the shorter doc scores higher", () => {
  const docs = [
    { id: "short", text: "atlas" },
    { id: "long", text: "atlas " + "filler ".repeat(50) },
  ];
  const ranked = bm25Rank(docs, "atlas");
  assert.equal(ranked[0].id, "short");
});

test("higher term frequency scores higher (same length class)", () => {
  const docs = [
    { id: "one", text: "atlas engine core module unit" },
    { id: "many", text: "atlas atlas atlas core module" },
  ];
  const ranked = bm25Rank(docs, "atlas");
  assert.equal(ranked[0].id, "many");
});

test("empty corpus and a no-match query both yield nothing", () => {
  assert.deepEqual(bm25Rank([], "anything"), []);
  assert.deepEqual(bm25Rank([{ id: "a", text: "hello world" }], "zzz"), []);
});

test("ties break deterministically by id", () => {
  const docs = [
    { id: "b", text: "atlas" },
    { id: "a", text: "atlas" },
  ];
  const ranked = bm25Rank(docs, "atlas");
  assert.deepEqual(ranked.map((r) => r.id), ["a", "b"]);
});
