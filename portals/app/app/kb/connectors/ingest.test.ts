import { test } from "node:test";
import assert from "node:assert/strict";
import { ingestEnvelope, revokeCascade, type IngestDeps } from "./ingest";
import type { IngestEnvelope } from "./envelope";
import { ContentService } from "../lib/content-service";
import { InMemoryContentStore } from "../lib/content-store";
import { InMemoryKbStore } from "../lib/store";
import { InMemoryObjectStore } from "../storage/objectstore";
import { InMemoryBindingStore } from "./binding-store";
import { TaskQueue } from "../processing/queue";

async function fixture() {
  const kbs = new InMemoryKbStore();
  const content = new ContentService(new InMemoryContentStore());
  const bindings = new InMemoryBindingStore();
  const objects = new InMemoryObjectStore();
  const queue = new TaskQueue();
  const kb = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "L" });
  const binding = await bindings.create({ kbId: kb.id, connectorCode: "arda", externalSourceId: "src1" });
  const deps: IngestDeps = { content, bindings, kbs, objects, queue };
  return { deps, content, bindings, queue, kbId: kb.id, bindingId: binding.id };
}

const bytesB64 = (s: string) => Buffer.from(s, "utf-8").toString("base64");

function upsert(bindingId: string, over: Partial<IngestEnvelope> = {}): IngestEnvelope {
  return {
    bindingId,
    event: "upsert",
    sourceDocId: "d1",
    contentHash: "h1",
    sourceRef: { uri: "arda://d1", externalVersion: "1" },
    content: { mime: "text/plain", bytes: bytesB64("hello") },
    ...over,
  };
}

test("upsert with bytes creates a connector document, stores it, and enqueues", async () => {
  const { deps, content, queue, kbId, bindingId } = await fixture();
  const r = await ingestEnvelope(upsert(bindingId), deps);
  assert.ok(r.ok);
  assert.equal(r.value.status, "created");
  const docId = (r.value as { documentId: string }).documentId;

  const got = await content.getDocument(docId);
  assert.ok(got.ok);
  assert.equal(got.value.source, "connector");
  assert.equal(got.value.connectorCode, "arda");
  assert.equal(got.value.contentHash, "h1");
  assert.ok(got.value.storageRef, "bytes were stored");
  assert.equal(got.value.sourceRef?.source_doc_id, "d1");
  assert.equal(got.value.sourceRef?.binding_id, bindingId);
  assert.equal(queue.depth, 1, "enqueued for processing");
  void kbId;
});

test("an unchanged hash is an idempotent ack - no new document", async () => {
  const { deps, content, kbId, bindingId } = await fixture();
  assert.ok((await ingestEnvelope(upsert(bindingId), deps)).ok);
  const again = await ingestEnvelope(upsert(bindingId), deps);
  assert.ok(again.ok);
  assert.equal(again.value.status, "unchanged");
  assert.equal((await content.listDocuments(kbId)).length, 1, "not duplicated");
});

test("a changed hash supersedes: the prior version is tombstoned, the new one is live", async () => {
  const { deps, content, kbId, bindingId } = await fixture();
  const first = await ingestEnvelope(upsert(bindingId), deps);
  assert.ok(first.ok);
  const firstId = (first.value as { documentId: string }).documentId;

  const changed = await ingestEnvelope(upsert(bindingId, { contentHash: "h2", content: { bytes: bytesB64("hello v2") } }), deps);
  assert.ok(changed.ok);
  assert.equal(changed.value.status, "superseded");

  // the old row is gone from the live list; exactly one live doc remains
  const live = await content.listDocuments(kbId);
  assert.equal(live.length, 1);
  assert.notEqual(live[0].id, firstId, "the live doc is the new version");
  assert.equal(live[0].contentHash, "h2");
});

test("fetch=ref (no bytes) creates a record that parks - no storage yet", async () => {
  const { deps, content, bindingId } = await fixture();
  const r = await ingestEnvelope(upsert(bindingId, { content: { fetchRef: "arda://content/tok" } }), deps);
  assert.ok(r.ok);
  assert.equal(r.value.status, "parked");
  const got = await content.getDocument((r.value as { documentId: string }).documentId);
  assert.ok(got.ok);
  assert.equal(got.value.storageRef, null);
  assert.equal(got.value.sourceRef?.fetch_ref, "arda://content/tok");
});

test("delete tombstones the live document; a delete of an absent id is a no-op ack", async () => {
  const { deps, content, kbId, bindingId } = await fixture();
  await ingestEnvelope(upsert(bindingId), deps);

  const del = await ingestEnvelope({ bindingId, event: "delete", sourceDocId: "d1", contentHash: null, sourceRef: null, content: null }, deps);
  assert.ok(del.ok);
  assert.equal(del.value.status, "deleted");
  assert.equal((await content.listDocuments(kbId)).length, 0, "no live docs after delete");

  const absent = await ingestEnvelope({ bindingId, event: "delete", sourceDocId: "never", contentHash: null, sourceRef: null, content: null }, deps);
  assert.ok(absent.ok);
  assert.equal(absent.value.status, "absent");
});

test("a paused or missing binding refuses ingest", async () => {
  const { deps, bindings, bindingId } = await fixture();
  await bindings.setState(bindingId, "paused");
  const paused = await ingestEnvelope(upsert(bindingId), deps);
  assert.ok(!paused.ok);
  assert.equal(paused.error.code, "binding_inactive");

  const missing = await ingestEnvelope(upsert("nope"), deps);
  assert.ok(!missing.ok);
  assert.equal(missing.error.code, "binding_not_found");
});

test("revoke cascade tombstones every live connector document of the binding", async () => {
  const { deps, content, kbId, bindingId } = await fixture();
  await ingestEnvelope(upsert(bindingId, { sourceDocId: "a", contentHash: "ha" }), deps);
  await ingestEnvelope(upsert(bindingId, { sourceDocId: "b", contentHash: "hb" }), deps);
  assert.equal((await content.listDocuments(kbId)).length, 2);

  const res = await revokeCascade(bindingId, deps);
  assert.equal(res.tombstoned, 2);
  assert.equal((await content.listDocuments(kbId)).length, 0, "all connector docs left recall");
});
