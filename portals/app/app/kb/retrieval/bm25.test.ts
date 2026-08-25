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

// --- CJK (batch 13) -----------------------------------------------------------
//
// The bug these pin: tokenize matched only [a-z0-9]+, so in a CHINESE-FIRST
// product a Chinese query produced ZERO tokens and therefore zero lexical hits
// against Chinese content - on the only recaller currently live, since vector
// recall waits on Atlas A1. Not "worse ranking": no ranking at all.

test("Chinese text produces tokens at all", () => {
  const t = tokenize("小雨条件");
  assert.ok(t.length > 0, "a Chinese string must not tokenize to nothing");
});

test("CJK indexes as OVERLAPPING BIGRAMS, so a longer term still matches", () => {
  // 单架次 is not a token in the document - 单架 and 架次 are, and the query
  // produces the same pair. That is the whole trick, and it needs no dictionary.
  assert.deepEqual(tokenize("单架次时长"), ["单架", "架次", "次时", "时长"]);
  assert.deepEqual(tokenize("单架次"), ["单架", "架次"]);
});

test("a Chinese query actually ranks Chinese documents", () => {
  const ranked = bm25Rank(
    [
      { id: "hit", text: "小雨条件下单架次时长为 25 分钟" },
      { id: "miss", text: "完全无关的另一段内容" },
    ],
    "小雨 单架次 时长",
  );
  assert.deepEqual(ranked.map((r) => r.id), ["hit"]);
  assert.ok(ranked[0].score > 0);
});

test("a lone CJK character is emitted as itself, not dropped", () => {
  // Otherwise a one-character query tokenizes to nothing and can never match.
  assert.deepEqual(tokenize("雨"), ["雨"]);
});

test("Latin and digits are unchanged - the old behaviour still holds", () => {
  assert.deepEqual(tokenize("Hello, World! 2026"), ["hello", "world", "2026"]);
  assert.deepEqual(tokenize("snake_case-and.dots"), ["snake", "case", "and", "dots"]);
});

test("mixed Latin/CJK splits on the boundary rather than bridging it", () => {
  // A bigram straddling "B标" would be a token that means nothing and matches
  // nothing.
  assert.deepEqual(tokenize("GB 51427 标准规范"), ["gb", "51427", "标准", "准规", "规范"]);
});

test("punctuation inside a CJK run does not create a bigram across it", () => {
  const t = tokenize("时长，复核");
  assert.ok(!t.includes("长复"), "a bigram across the comma would be a phantom term");
  assert.ok(t.includes("时长") && t.includes("复核"));
});

test("Japanese kana and Korean hangul tokenize too", () => {
  // The CJK range is not Chinese-only, and a product serving one CJK script
  // should not silently fail on the neighbours.
  assert.ok(tokenize("こんにちは").length > 0);
  assert.ok(tokenize("안녕하세요").length > 0);
});

test("an empty or punctuation-only string yields no tokens rather than throwing", () => {
  assert.deepEqual(tokenize(""), []);
  assert.deepEqual(tokenize("！！！"), []);
  assert.deepEqual(tokenize("   "), []);
});
