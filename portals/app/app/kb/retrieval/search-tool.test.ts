import { test } from "node:test";
import assert from "node:assert/strict";
import { searchTool } from "./search-tool";
import { VisibleSetResolver } from "./visible-set";
import { InMemoryRecallCorpus } from "./corpus";
import { InMemoryKbStore } from "../lib/store";
import { InMemoryAttachmentStore } from "../attachments/store";
import { InMemoryUsageStore, setUsageStore } from "../../usage/lib/store";
import type { CallerContext } from "../tools/s2s";

const caller = (over: Partial<CallerContext> = {}): CallerContext => ({
  callerProduct: "agent",
  org: "org1",
  workspace: "ws1",
  user: "u1",
  mode: "obo",
  ...over,
});

async function fixture() {
  const kbs = new InMemoryKbStore();
  const attachments = new InMemoryAttachmentStore();
  const corpus = new InMemoryRecallCorpus();
  const deps = { visibleSet: new VisibleSetResolver(kbs), attachments, corpus };
  const kb = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "L" });
  return { deps, kbs, attachments, corpus, kbId: kb.id };
}

test("search returns BM25 results over an attached, visible, indexed library (degrading rerank to RRF)", async () => {
  const { deps, attachments, corpus, kbId } = await fixture();
  await attachments.attach({ workspaceId: "ws1", userSub: "u1", productCode: "agent", kbId });
  corpus.add({ id: "c1", kbId, kind: "chunk", text: "atlas retrieval engine", verificationState: "unverified" });
  corpus.add({ id: "c2", kbId, kind: "chunk", text: "unrelated content here", verificationState: "unverified" });

  const r = await searchTool(caller(), { query: "atlas" }, deps);
  assert.equal(r.items.length, 1, "only the matching unit");
  assert.equal(r.items[0].id, "c1");
  assert.equal(r.items[0].kbId, kbId);
  assert.equal(r.degraded, "rerank_unavailable", "no reranker -> RRF order, tagged");
});

test("a library that is visible but NOT attached is out of scope (attachment narrows)", async () => {
  const { deps, corpus, kbId } = await fixture();
  corpus.add({ id: "c1", kbId, kind: "chunk", text: "atlas here", verificationState: "unverified" });
  // not attached -> whitelist empty -> no results (not a leak)
  const r = await searchTool(caller(), { query: "atlas" }, deps);
  assert.deepEqual(r.items, []);
});

test("kb_ids can only narrow; an id outside the scope is ignored and echoed", async () => {
  const { deps, attachments, corpus, kbId } = await fixture();
  await attachments.attach({ workspaceId: "ws1", userSub: "u1", productCode: "agent", kbId });
  corpus.add({ id: "c1", kbId, kind: "chunk", text: "atlas", verificationState: "unverified" });

  const r = await searchTool(caller(), { query: "atlas", kb_ids: [kbId, "kb-not-mine"] }, deps);
  assert.deepEqual(r.items.map((i) => i.id), ["c1"]);
  assert.deepEqual(r.ignored_kb_ids, ["kb-not-mine"]);
});

test("search meters a per-call karda.search event", async () => {
  const usage = new InMemoryUsageStore();
  setUsageStore(usage);
  try {
    const { deps, attachments, corpus, kbId } = await fixture();
    await attachments.attach({ workspaceId: "ws1", userSub: "u1", productCode: "agent", kbId });
    corpus.add({ id: "c1", kbId, kind: "chunk", text: "atlas", verificationState: "unverified" });
    await searchTool(caller(), { query: "atlas" }, deps);
    const buffered = await usage.unflushed(10);
    assert.equal(buffered.length, 1);
    assert.equal(buffered[0].metric, "karda.search");
    assert.equal(buffered[0].workspaceId, "ws1");
  } finally {
    setUsageStore(null);
  }
});
