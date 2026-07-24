import { test } from "node:test";
import assert from "node:assert/strict";
import { writeDocument, type WriteDeps } from "./write";
import type { CallerContext } from "./s2s";
import { KbService } from "../lib/service";
import { InMemoryKbStore } from "../lib/store";
import { ContentService } from "../lib/content-service";
import { InMemoryContentStore } from "../lib/content-store";
import { InMemoryObjectStore } from "../storage/objectstore";
import { TaskQueue } from "../processing/queue";

const oboCaller = (over: Partial<CallerContext> = {}): CallerContext => ({
  callerProduct: "agent",
  org: "org1",
  workspace: "ws1",
  user: "u1",
  mode: "obo",
  ...over,
});

async function fixture() {
  const kb = new KbService(new InMemoryKbStore());
  const content = new ContentService(new InMemoryContentStore());
  const objects = new InMemoryObjectStore();
  const queue = new TaskQueue();
  const lib = await kb.create({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "L" });
  assert.ok(lib.ok);
  const deps: WriteDeps = { kb, content, objects, queue };
  return { deps, kbId: lib.value.id, content, queue };
}

test("write_document captures inline content, creates a processing doc, and enqueues it", async () => {
  const { deps, kbId, content, queue } = await fixture();
  const r = await writeDocument(oboCaller(), { kb_id: kbId, content: "hello knowledge", title: "note" }, deps);
  assert.equal(r.status, 201);
  const docId = (r.body.document as { id: string }).id;

  const got = await content.getDocument(docId);
  assert.ok(got.ok);
  assert.equal(got.value.contentState, "processing", "a captured document lands in processing");
  assert.equal(got.value.title, "note");
  assert.equal(queue.depth, 1, "the document was enqueued for processing on the shared queue");
});

test("write_document rejects a library outside the caller's workspace (knowing an id is not permission)", async () => {
  const { deps, kbId } = await fixture();
  const r = await writeDocument(oboCaller({ workspace: "other-ws" }), { kb_id: kbId, content: "x" }, deps);
  assert.equal(r.status, 404);
});

test("write_document validates args: kb_id required, content non-empty, file_ref not yet wired", async () => {
  const { deps, kbId } = await fixture();
  assert.equal((await writeDocument(oboCaller(), { content: "x" }, deps)).status, 400, "no kb_id");
  assert.equal((await writeDocument(oboCaller(), { kb_id: kbId, content: "" }, deps)).status, 400, "empty content");
  const fr = await writeDocument(oboCaller(), { kb_id: kbId, file_ref: "obj://x" }, deps);
  assert.equal(fr.status, 501, "file_ref ingestion is not wired yet");
  assert.equal(fr.body.error, "not_implemented");
});

test("write_document dedups identical content in the same library (409)", async () => {
  const { deps, kbId } = await fixture();
  assert.equal((await writeDocument(oboCaller(), { kb_id: kbId, content: "same bytes" }, deps)).status, 201);
  const dup = await writeDocument(oboCaller(), { kb_id: kbId, content: "same bytes" }, deps);
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error, "duplicate_document");
});
