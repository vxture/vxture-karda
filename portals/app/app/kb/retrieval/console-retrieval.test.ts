import { test } from "node:test";
import assert from "node:assert/strict";
import { consoleSearch, consoleAsk, type ConsoleRetrievalDeps } from "./console-retrieval";
import { InMemoryRecallCorpus } from "./corpus";
import type { GenerationClient, ChatRequest } from "./ask";

// Two visible libraries; kb-hidden exists but is not visible to the caller.
const VISIBLE = [
  { kbId: "kb-a", namespace: "org" as const },
  { kbId: "kb-b", namespace: "org" as const },
];

function makeDeps(over: Partial<ConsoleRetrievalDeps> = {}): ConsoleRetrievalDeps {
  const corpus = new InMemoryRecallCorpus([
    { id: "u1", kbId: "kb-a", kind: "chunk", text: "postgres vector store design", verificationState: "unverified" },
    { id: "u2", kbId: "kb-b", kind: "entry", text: "atlas embedding quota rules", verificationState: "unverified" },
    { id: "u3", kbId: "kb-hidden", kind: "chunk", text: "postgres secrets nobody should see", verificationState: "unverified" },
  ]);
  return {
    visibleSet: { async resolve() { return VISIBLE; } },
    corpus,
    texts: corpus,
    ...over,
  };
}

const caller = { org: "org1", ws: "ws1", user: "usr_1" };

test("default scope is the whole visible set, and hits carry snippets", async () => {
  const deps = makeDeps();
  const r = await consoleSearch(caller, { query: "postgres" }, deps);
  assert.deepEqual(r.scopeKbIds.sort(), ["kb-a", "kb-b"]);
  assert.equal(r.items.length, 1, "only the visible postgres hit");
  assert.equal(r.items[0].kbId, "kb-a");
  assert.match(r.items[0].snippet, /vector store/);
});

test("kb_ids narrow within visibility; a non-visible id is ignored and echoed", async () => {
  const deps = makeDeps();
  const r = await consoleSearch(caller, { query: "postgres", kb_ids: ["kb-b", "kb-hidden"] }, deps);
  assert.deepEqual(r.scopeKbIds, ["kb-b"]);
  assert.deepEqual(r.ignoredKbIds, ["kb-hidden"]);
  assert.equal(r.items.length, 0, "the postgres hit lives in kb-a, outside the narrowed scope");
});

test("the invisible library can never be searched, even named directly", async () => {
  const deps = makeDeps();
  const r = await consoleSearch(caller, { query: "secrets", kb_ids: ["kb-hidden"] }, deps);
  assert.deepEqual(r.items, []);
  assert.deepEqual(r.ignoredKbIds, ["kb-hidden"]);
});

test("search degrades to keyword order when no reranker is configured (tagged, not failed)", async () => {
  const r = await consoleSearch(caller, { query: "atlas" }, makeDeps());
  assert.equal(r.degraded, "rerank_unavailable");
  assert.equal(r.partial, false);
});

test("ask without a generation client reports notConfigured", async () => {
  const r = await consoleAsk(caller, { question: "what is the vector store?" }, makeDeps());
  assert.ok("notConfigured" in r);
});

test("ask grounds on visible content and returns cited snippets", async () => {
  const seen: ChatRequest[] = [];
  const generation: GenerationClient = {
    async chat(req) {
      seen.push(req);
      return { content: "It is Postgres [1]." };
    },
  };
  const r = await consoleAsk(caller, { question: "vector store?" }, makeDeps({ generation }));
  assert.ok(!("notConfigured" in r));
  if ("notConfigured" in r) return;
  assert.equal(r.answer, "It is Postgres [1].");
  assert.equal(r.citations.length, 1);
  assert.equal(r.citations[0].kbId, "kb-a");
  assert.match(r.citations[0].snippet, /vector store/);
  // the Atlas call carried the console task id + the caller's tenant context
  assert.equal(seen.length, 1);
  assert.match(seen[0].taskId, /^karda:console:/);
  assert.equal(seen[0].tenantId, "org1");
  assert.equal(seen[0].workspaceId, "ws1");
});

test("ask with no grounding generates nothing (noContext, no model call)", async () => {
  let called = 0;
  const generation: GenerationClient = {
    async chat() {
      called += 1;
      return { content: "x" };
    },
  };
  const r = await consoleAsk(caller, { question: "zebra unicorn" }, makeDeps({ generation }));
  if ("notConfigured" in r) throw new Error("unexpected");
  assert.equal(r.noContext, true);
  assert.equal(called, 0);
});
