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

/** A grant-routed fake: reports which model "resolved" alongside the vector. */
const embedderOf = (vec: number[], modelCode = "m"): QueryEmbedder => ({
  async embed() {
    return { vectors: [vec], modelCode };
  },
});

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
  const hits = await new VectorRecaller(corpus, embedderOf([1, 0])).recall(q());
  assert.deepEqual(hits.map((h) => h.id), ["near", "far"]);
});

test("the model lock follows the RESOLVED model: other-space vectors are never compared (KD-107/KD-018)", async () => {
  const corpus = new InMemoryVectorCorpus([
    { id: "other-space", kbId: "kb1", modelCode: "old-model", vector: [1, 0], verificationState: "unverified" },
    { id: "same-space", kbId: "kb1", modelCode: "new-model", vector: [1, 0], verificationState: "unverified" },
  ]);
  // the grant now resolves to new-model: old-model chunks drop out of vector
  // recall (visible, safe degradation) rather than being ranked cross-space.
  const hits = await new VectorRecaller(corpus, embedderOf([1, 0], "new-model")).recall(q());
  assert.deepEqual(hits.map((h) => h.id), ["same-space"]);
});

test("the verification quality tier applies (default excludes stale)", async () => {
  const corpus = new InMemoryVectorCorpus([
    { id: "stale", kbId: "kb1", modelCode: "m", vector: [1, 0], verificationState: "stale" },
    { id: "ok", kbId: "kb1", modelCode: "m", vector: [1, 0], verificationState: "verified" },
  ]);
  const hits = await new VectorRecaller(corpus, embedderOf([1, 0])).recall(q());
  assert.deepEqual(hits.map((h) => h.id), ["ok"]);
});

test("self-degrades to [] when the query embed fails - BM25 must keep the namespace alive", async () => {
  const corpus = new InMemoryVectorCorpus([
    { id: "c", kbId: "kb1", modelCode: "m", vector: [1, 0], verificationState: "unverified" },
  ]);
  const failing: QueryEmbedder = {
    async embed() {
      throw new Error("TASK_PROFILE_NOT_ROUTABLE");
    },
  };
  const hits = await new VectorRecaller(corpus, failing).recall(q());
  assert.deepEqual(hits, []);
});

test("empty scope or blank query recalls nothing without calling Atlas", async () => {
  let called = 0;
  const counting: QueryEmbedder = {
    async embed() {
      called += 1;
      return { vectors: [[1]], modelCode: "m" };
    },
  };
  const corpus = new InMemoryVectorCorpus();
  assert.deepEqual(await new VectorRecaller(corpus, counting).recall(q({ kbIds: [] })), []);
  assert.deepEqual(await new VectorRecaller(corpus, counting).recall(q({ query: "  " })), []);
  assert.equal(called, 0);
});
