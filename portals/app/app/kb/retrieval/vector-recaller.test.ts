import { test } from "node:test";
import assert from "node:assert/strict";
import { VectorRecaller, cosineSimilarity, type QueryEmbedder } from "./vector-recaller";
import { InMemoryVectorCorpus } from "./vector-corpus";
import type { RecallQuery } from "./search";

const q = (over: Partial<RecallQuery> = {}): RecallQuery => ({
  query: "hello",
  namespace: "org" as RecallQuery["namespace"],
  kbIds: ["kb1"],
  verificationFilter: "verified_and_untracked" as RecallQuery["verificationFilter"],
  topN: 10,
  ...over,
});

const embedderOf = (vec: number[]): QueryEmbedder => ({ async embed() { return [vec]; } });

test("cosineSimilarity: identical direction 1, orthogonal 0, mismatched dims 0", () => {
  assert.ok(Math.abs(cosineSimilarity([1, 0], [2, 0]) - 1) < 1e-9);
  assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  assert.equal(cosineSimilarity([1, 0], [1]), 0);
  assert.equal(cosineSimilarity([], []), 0);
});

test("ranks by cosine similarity and returns top-N hits", async () => {
  const corpus = new InMemoryVectorCorpus([
    { id: "far", kbId: "kb1", modelCode: "m", vector: [0, 1], verificationState: "unverified" },
    { id: "near", kbId: "kb1", modelCode: "m", vector: [1, 0.1], verificationState: "unverified" },
  ]);
  const hits = await new VectorRecaller(corpus, embedderOf([1, 0]), "m").recall(q());
  assert.deepEqual(hits.map((h) => h.id), ["near", "far"]);
});

test("the KD-107 model lock: vectors from another model are never compared", async () => {
  const corpus = new InMemoryVectorCorpus([
    { id: "other-space", kbId: "kb1", modelCode: "other", vector: [1, 0], verificationState: "unverified" },
    { id: "same-space", kbId: "kb1", modelCode: "m", vector: [1, 0], verificationState: "unverified" },
  ]);
  const hits = await new VectorRecaller(corpus, embedderOf([1, 0]), "m").recall(q());
  assert.deepEqual(hits.map((h) => h.id), ["same-space"]);
});

test("the verification quality tier applies (default excludes stale)", async () => {
  const corpus = new InMemoryVectorCorpus([
    { id: "stale", kbId: "kb1", modelCode: "m", vector: [1, 0], verificationState: "stale" },
    { id: "ok", kbId: "kb1", modelCode: "m", vector: [1, 0], verificationState: "verified" },
  ]);
  const hits = await new VectorRecaller(corpus, embedderOf([1, 0]), "m").recall(q());
  assert.deepEqual(hits.map((h) => h.id), ["ok"]);
});

test("self-degrades to [] when the query embed fails - BM25 must keep the namespace alive", async () => {
  const corpus = new InMemoryVectorCorpus([
    { id: "c", kbId: "kb1", modelCode: "m", vector: [1, 0], verificationState: "unverified" },
  ]);
  const failing: QueryEmbedder = { async embed() { throw new Error("atlas down"); } };
  const hits = await new VectorRecaller(corpus, failing, "m").recall(q());
  assert.deepEqual(hits, []);
});

test("empty scope or blank query recalls nothing without calling Atlas", async () => {
  let called = 0;
  const counting: QueryEmbedder = { async embed() { called += 1; return [[1]]; } };
  const corpus = new InMemoryVectorCorpus();
  assert.deepEqual(await new VectorRecaller(corpus, counting, "m").recall(q({ kbIds: [] })), []);
  assert.deepEqual(await new VectorRecaller(corpus, counting, "m").recall(q({ query: "  " })), []);
  assert.equal(called, 0);
});
