import { test } from "node:test";
import assert from "node:assert/strict";
import { Bm25Recaller } from "./bm25-recaller";
import { InMemoryRecallCorpus, type RecallUnit } from "./corpus";
import type { RecallQuery } from "./search";

const unit = (over: Partial<RecallUnit>): RecallUnit => ({
  id: "u1",
  kbId: "kb1",
  kind: "chunk",
  text: "atlas retrieval engine",
  verificationState: "unverified",
  ...over,
});

const query = (over: Partial<RecallQuery> = {}): RecallQuery => ({
  query: "atlas",
  namespace: "org",
  kbIds: ["kb1"],
  verificationFilter: "verified_and_untracked",
  topN: 50,
  ...over,
});

test("recall ranks the corpus and returns hits with their kbId, capped at topN", async () => {
  const corpus = new InMemoryRecallCorpus([
    unit({ id: "a", text: "atlas atlas core" }),
    unit({ id: "b", text: "atlas one mention" }),
    unit({ id: "c", text: "no relevant terms here" }),
  ]);
  const hits = await new Bm25Recaller(corpus).recall(query({ topN: 1 }));
  assert.equal(hits.length, 1, "capped at topN");
  assert.equal(hits[0].id, "a", "most relevant first");
  assert.equal(hits[0].kbId, "kb1");
});

test("only units in the requested libraries are considered", async () => {
  const corpus = new InMemoryRecallCorpus([
    unit({ id: "in", kbId: "kb1", text: "atlas here" }),
    unit({ id: "out", kbId: "kb2", text: "atlas atlas atlas" }),
  ]);
  const hits = await new Bm25Recaller(corpus).recall(query({ kbIds: ["kb1"] }));
  assert.deepEqual(hits.map((h) => h.id), ["in"], "kb2 is out of scope even though it matches harder");
});

test("the verification filter drops stale under the default tier, keeps unverified", async () => {
  const corpus = new InMemoryRecallCorpus([
    unit({ id: "fresh", text: "atlas", verificationState: "unverified" }),
    unit({ id: "stale", text: "atlas atlas atlas", verificationState: "stale" }),
    unit({ id: "ok", text: "atlas atlas", verificationState: "verified" }),
  ]);
  const hits = await new Bm25Recaller(corpus).recall(query());
  const ids = hits.map((h) => h.id);
  assert.ok(!ids.includes("stale"), "stale excluded by verified_and_untracked");
  assert.ok(ids.includes("fresh") && ids.includes("ok"));
});

test("verified_only keeps only verified units", async () => {
  const corpus = new InMemoryRecallCorpus([
    unit({ id: "u", text: "atlas", verificationState: "unverified" }),
    unit({ id: "v", text: "atlas", verificationState: "verified" }),
  ]);
  const hits = await new Bm25Recaller(corpus).recall(query({ verificationFilter: "verified_only" }));
  assert.deepEqual(hits.map((h) => h.id), ["v"]);
});

test("empty scope yields no recall (no corpus fetch needed)", async () => {
  const hits = await new Bm25Recaller(new InMemoryRecallCorpus([unit({})])).recall(query({ kbIds: [] }));
  assert.deepEqual(hits, []);
});
