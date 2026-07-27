import { test } from "node:test";
import assert from "node:assert/strict";
import { askTool } from "./ask-tool";
import { VisibleSetResolver } from "./visible-set";
import { InMemoryRecallCorpus } from "./corpus";
import { InMemoryKbStore } from "../lib/store";
import { InMemoryAttachmentStore } from "../attachments/store";
import { InMemoryUsageStore, setUsageStore } from "../../usage/lib/store";
import type { GenerationClient, ChatRequest } from "./ask";
import type { CallerContext } from "../tools/s2s";

const caller = (over: Partial<CallerContext> = {}): CallerContext => ({
  callerProduct: "agent",
  org: "org1",
  workspace: "ws1",
  user: "u1",
  mode: "obo",
  ...over,
});

function mockGen(): GenerationClient & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = [];
  return { calls, async chat(req) { calls.push(req); return { content: "grounded answer [1]" }; } };
}

async function fixture(gen: GenerationClient) {
  const kbs = new InMemoryKbStore();
  const attachments = new InMemoryAttachmentStore();
  const corpus = new InMemoryRecallCorpus();
  const kb = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "L" });
  const deps = { visibleSet: new VisibleSetResolver(kbs), attachments, corpus, textResolver: corpus, generation: gen, modelCode: "m1" };
  return { deps, attachments, corpus, kbId: kb.id };
}

test("ask grounds an answer over recalled content and cites it", async () => {
  const gen = mockGen();
  const { deps, attachments, corpus, kbId } = await fixture(gen);
  await attachments.attach({ workspaceId: "ws1", userSub: "u1", productCode: "agent", kbId });
  corpus.add({ id: "c1", kbId, kind: "chunk", text: "atlas is the model platform", verificationState: "unverified" });

  const r = await askTool(caller(), { question: "what is atlas?" }, deps);
  assert.equal(r.no_context, false);
  assert.equal(r.answer, "grounded answer [1]");
  assert.deepEqual(r.citations, [{ id: "c1", kbId }]);
  assert.equal(gen.calls.length, 1, "the model was called once");
  assert.equal(gen.calls[0].modelCode, "m1");
  assert.equal(gen.calls[0].tenantId, "org1");
  // the grounding prompt must carry the recalled text
  assert.match(gen.calls[0].messages.map((m) => m.content).join("\n"), /atlas is the model platform/);
});

test("no recalled context -> no generation, no_context true (no ungrounded answer)", async () => {
  const gen = mockGen();
  const { deps } = await fixture(gen); // nothing attached -> empty scope
  const r = await askTool(caller(), { question: "anything?" }, deps);
  assert.equal(r.no_context, true);
  assert.equal(r.answer, "");
  assert.equal(gen.calls.length, 0, "the model is NOT called without grounding");
});

test("a grounded ask meters a per-call karda.ask; a no-context ask does not", async () => {
  const usage = new InMemoryUsageStore();
  setUsageStore(usage);
  try {
    const gen = mockGen();
    const { deps, attachments, corpus, kbId } = await fixture(gen);
    await attachments.attach({ workspaceId: "ws1", userSub: "u1", productCode: "agent", kbId });
    corpus.add({ id: "c1", kbId, kind: "chunk", text: "atlas", verificationState: "unverified" });

    await askTool(caller(), { question: "atlas?" }, deps); // grounded -> metered
    await askTool(caller(), { question: "nomatchxyz?" }, deps); // no context -> not metered

    const buffered = await usage.unflushed(10);
    assert.equal(buffered.length, 1);
    assert.equal(buffered[0].metric, "karda.ask");
  } finally {
    setUsageStore(null);
  }
});
