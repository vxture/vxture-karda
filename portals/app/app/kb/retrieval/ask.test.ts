import { test } from "node:test";
import assert from "node:assert/strict";
import { runAsk, buildPrompt, type GenerationClient, type ChunkResolver, type ChatRequest } from "./ask";
import { UnavailableReranker, type Recaller } from "./search";
import type { ScopedKb } from "./scope";

const org = (id: string): ScopedKb => ({ kbId: id, namespace: "org" });
const scopeOf = (kbs: ScopedKb[]) => ({
  whitelist: kbs,
  namespaces: [...new Set(kbs.map((k) => k.namespace))],
  ignoredKbIds: [],
});

const bm25 = (hits: Record<string, { id: string; kbId: string }[]>): Recaller => ({
  async recall(q) {
    return hits[q.namespace] ?? [];
  },
});

const resolver = (m: Record<string, string>): ChunkResolver => ({
  async resolve(ids) {
    return ids.filter((id) => id in m).map((id) => ({ id, kbId: "k", content: m[id] }));
  },
});

class CapturingGen implements GenerationClient {
  lastReq: ChatRequest | null = null;
  constructor(private answer = "the answer [1]") {}
  async chat(req: ChatRequest) {
    this.lastReq = req;
    return { content: this.answer };
  }
}

test("ask retrieves, grounds, generates, and returns citations", async () => {
  const gen = new CapturingGen();
  const r = await runAsk({
    query: "what is x?",
    scope: scopeOf([org("k")]),
    recallers: [bm25({ org: [{ id: "c1", kbId: "k" }] })],
    reranker: new UnavailableReranker(), // degraded search still grounds an answer
    tenantId: "ten_1",
    userId: "usr_1",
    modelCode: "gpt-x",
    resolver: resolver({ c1: "x is the thing" }),
    generation: gen,
  });
  assert.equal(r.noContext, false);
  assert.equal(r.answer, "the answer [1]");
  assert.deepEqual(r.citations, [{ id: "c1", kbId: "k" }]);
  // it degrades (rerank stub) but still answers - A4 is live, A3 is not
  assert.equal(r.degraded, "rerank_unavailable");
});

test("no retrieval context means no generation and an honest no-context result", async () => {
  const gen = new CapturingGen();
  const r = await runAsk({
    query: "what is x?",
    scope: scopeOf([org("k")]),
    recallers: [bm25({ org: [] })], // nothing recalled
    reranker: new UnavailableReranker(),
    tenantId: "ten_1",
    modelCode: "gpt-x",
    resolver: resolver({}),
    generation: gen,
  });
  assert.equal(r.noContext, true);
  assert.equal(r.answer, "");
  assert.equal(gen.lastReq, null, "generation must not run without grounding");
});

test("the ChatRequest carries tenant/user attribution and temperature 0", async () => {
  const gen = new CapturingGen();
  await runAsk({
    query: "q",
    scope: scopeOf([org("k")]),
    recallers: [bm25({ org: [{ id: "c1", kbId: "k" }] })],
    reranker: new UnavailableReranker(),
    tenantId: "ten_9",
    userId: "usr_9",
    modelCode: "model-a",
    resolver: resolver({ c1: "text" }),
    generation: gen,
  });
  assert.equal(gen.lastReq?.tenantId, "ten_9");
  assert.equal(gen.lastReq?.userId, "usr_9");
  assert.equal(gen.lastReq?.temperature, 0, "cited answering is deterministic, not creative");
  assert.equal(gen.lastReq?.modelCode, "model-a");
});

test("the prompt numbers context for citation and forbids outside knowledge", () => {
  const msgs = buildPrompt("q?", [
    { id: "a", kbId: "k", content: "first" },
    { id: "b", kbId: "k", content: "second" },
  ]);
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[0].content, /ONLY the numbered context/);
  assert.match(msgs[0].content, /do not use outside knowledge/);
  assert.match(msgs[1].content, /\[1\] first/);
  assert.match(msgs[1].content, /\[2\] second/);
  assert.match(msgs[1].content, /Question: q\?/);
});

test("ask only grounds in chunks the resolver can actually return", async () => {
  // A recalled id whose text the resolver cannot fetch is dropped from grounding
  // and from citations - the answer cannot cite what it was not shown.
  const gen = new CapturingGen();
  const r = await runAsk({
    query: "q",
    scope: scopeOf([org("k")]),
    recallers: [bm25({ org: [{ id: "c1", kbId: "k" }, { id: "c2", kbId: "k" }] })],
    reranker: new UnavailableReranker(),
    tenantId: "t",
    modelCode: "m",
    resolver: resolver({ c1: "only c1 resolves" }), // c2 missing
    generation: gen,
  });
  assert.deepEqual(r.citations.map((c) => c.id), ["c1"]);
});
