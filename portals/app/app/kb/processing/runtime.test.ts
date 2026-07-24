import { test } from "node:test";
import assert from "node:assert/strict";
import { ContentSink, enqueueForDocument, makeResolver } from "./runtime";
import { TaskQueue, type Task } from "./queue";
import { ContentService } from "../lib/content-service";
import { InMemoryContentStore } from "../lib/content-store";
import { InMemoryObjectStore } from "../storage/objectstore";
import { uploadDocument } from "../lib/upload";

const config = { processingTemplateId: null, processingParams: {}, embeddingModel: null };
const task = (docId: string): Task =>
  ({ key: "k", docId, kbId: "kb1", org: "ws1", tier: "interactive", attempt: 0, runAfter: 0, suspended: false });

// --- sink -------------------------------------------------------------------

test("ContentSink.markIndexed moves a processing document to indexed", async () => {
  const content = new ContentService(new InMemoryContentStore());
  const d = await content.createDocument({ kbId: "kb1", title: "t", source: "upload", contentHash: "h1" });
  assert.ok(d.ok);
  await new ContentSink(content).markIndexed(d.value.id);
  const got = await content.getDocument(d.value.id);
  assert.ok(got.ok);
  assert.equal(got.value.contentState, "indexed");
});

test("ContentSink.markFailed moves to failed and records the reason", async () => {
  const content = new ContentService(new InMemoryContentStore());
  const d = await content.createDocument({ kbId: "kb1", title: "t", source: "upload", contentHash: "h2" });
  assert.ok(d.ok);
  await new ContentSink(content).markFailed(d.value.id, "chunk: boom");
  const got = await content.getDocument(d.value.id);
  assert.ok(got.ok);
  assert.equal(got.value.contentState, "failed");
  assert.equal(got.value.failureReason, "chunk: boom");
});

test("ContentSink swallows a benign race: the document was deleted mid-flight", async () => {
  const content = new ContentService(new InMemoryContentStore());
  const d = await content.createDocument({ kbId: "kb1", title: "t", source: "upload", contentHash: "h3" });
  assert.ok(d.ok);
  // owner deletes it while the pipeline was running (processing -> deleted)
  await content.transitionDocument(d.value.id, "deleted");
  // the worker's markIndexed must not throw - the document already moved on
  await assert.doesNotReject(() => new ContentSink(content).markIndexed(d.value.id));
});

// --- enqueue ----------------------------------------------------------------

test("enqueueForDocument derives org, tier, and dedups by key", async () => {
  const q = new TaskQueue();
  const p = { docId: "d1", kbId: "kb1", workspaceId: "ws1", contentHash: "h1", config, trigger: "upload" as const };

  assert.equal(enqueueForDocument(q, p), true);
  assert.equal(enqueueForDocument(q, p), false, "identical task dedups");
  assert.equal(q.depth, 1);

  const claimed = q.claim(0);
  assert.ok(claimed);
  assert.equal(claimed.org, "ws1", "org = owning workspace");
  assert.equal(claimed.tier, "interactive", "upload -> interactive tier");
});

test("enqueueForDocument: a new retry generation is a NEW task, not a dedup", async () => {
  const q = new TaskQueue();
  const p = { docId: "d1", kbId: "kb1", workspaceId: "ws1", contentHash: "h1", config, trigger: "upload" as const };
  assert.equal(enqueueForDocument(q, p), true);
  assert.equal(enqueueForDocument(q, { ...p, retryGeneration: 1 }), true, "gen 1 is a distinct key");
  assert.equal(q.depth, 2);
});

// --- resolver ---------------------------------------------------------------

test("makeResolver returns the raw text source and the injected ports", async () => {
  const content = new ContentService(new InMemoryContentStore());
  const objects = new InMemoryObjectStore();
  const put = await objects.put("ws1", "kb1", Buffer.from("hello world"));
  const d = await content.createDocument({
    kbId: "kb1", title: "t", source: "upload", contentHash: put.contentHash, storageRef: put.key, mime: "text/plain",
  });
  assert.ok(d.ok);

  const embedder = { embed: async () => [] };
  const target = { commit: async () => {} };
  const resolve = makeResolver({ content, objects, embedder: () => embedder, commitTargetFor: () => target });

  const r = await resolve(task(d.value.id));
  assert.ok(r);
  assert.equal(r.source.mime, "text/plain");
  assert.equal(await r.source.fetchText(), "hello world");
  assert.equal(r.embedder, embedder, "injected embedder is used");
  assert.equal(r.target, target, "injected commit target is used");
  assert.equal(r.embeddingModel, null);
});

test("makeResolver returns null when the document is gone (task is dropped)", async () => {
  const content = new ContentService(new InMemoryContentStore());
  const resolve = makeResolver({ content, objects: new InMemoryObjectStore() });
  assert.equal(await resolve(task("nope")), null);
});

// --- enqueue-on-upload ------------------------------------------------------

test("uploadDocument runs the enqueue hook once, only on a successful create", async () => {
  const content = new ContentService(new InMemoryContentStore());
  const objects = new InMemoryObjectStore();
  const seen: string[] = [];
  const enqueue = (doc: { id: string }) => { seen.push(doc.id); };

  const up = { kbId: "kb1", workspaceId: "ws1", folderId: null, title: "t", mime: "text/plain", bytes: Buffer.from("x") };
  const first = await uploadDocument(up, content, objects, enqueue);
  assert.ok(first.ok);
  assert.deepEqual(seen, [first.value.id]);

  // identical bytes in the same KB is a duplicate - the hook must NOT fire again.
  const dup = await uploadDocument(up, content, objects, enqueue);
  assert.equal(dup.ok, false);
  assert.equal(seen.length, 1, "no enqueue for a rejected duplicate");
});
