import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadDocument, downloadDocument } from "./upload";
import { ContentService } from "./content-service";
import { InMemoryContentStore } from "./content-store";
import { InMemoryObjectStore } from "../storage/objectstore";

const KB = "kb_1";
const WS = "ws_1";

function fixture() {
  const content = new ContentService(new InMemoryContentStore());
  const objects = new InMemoryObjectStore();
  return { content, objects };
}

const bytes = (s: string) => Buffer.from(s, "utf8");

test("uploading a file stores bytes and creates a document record", async () => {
  const { content, objects } = fixture();
  const r = await uploadDocument(
    { kbId: KB, workspaceId: WS, title: "readme.md", mime: "text/markdown", bytes: bytes("# hi") },
    content,
    objects,
  );
  assert.ok(r.ok);
  assert.equal(r.value.title, "readme.md");
  assert.equal(r.value.source, "upload");
  assert.equal(r.value.contentState, "processing"); // queued, worker advances later
  assert.ok(r.value.storageRef, "record points at the stored object");
  assert.equal(r.value.sizeBytes, 4);
  assert.equal(objects.size, 1);
});

test("an empty file is rejected before anything is stored", async () => {
  const { content, objects } = fixture();
  const r = await uploadDocument(
    { kbId: KB, workspaceId: WS, title: "empty", mime: "text/plain", bytes: Buffer.alloc(0) },
    content,
    objects,
  );
  assert.deepEqual(r, { ok: false, error: { code: "empty_file" } });
  assert.equal(objects.size, 0);
});

test("re-uploading identical bytes is a duplicate, not a second record", async () => {
  const { content, objects } = fixture();
  const input = { kbId: KB, workspaceId: WS, title: "a", mime: "text/plain", bytes: bytes("same") };
  assert.ok((await uploadDocument(input, content, objects)).ok);
  const second = await uploadDocument({ ...input, title: "b" }, content, objects);
  assert.deepEqual(second, { ok: false, error: { code: "duplicate_document" } });
  // content-addressed: the bytes were not doubled
  assert.equal(objects.size, 1);
  // and only one record exists
  assert.equal((await content.listDocuments(KB)).length, 1);
});

test("different content in the same library is allowed", async () => {
  const { content, objects } = fixture();
  assert.ok((await uploadDocument({ kbId: KB, workspaceId: WS, title: "a", mime: "text/plain", bytes: bytes("one") }, content, objects)).ok);
  assert.ok((await uploadDocument({ kbId: KB, workspaceId: WS, title: "b", mime: "text/plain", bytes: bytes("two") }, content, objects)).ok);
  assert.equal((await content.listDocuments(KB)).length, 2);
});

test("a document can be filed under a folder that belongs to the KB", async () => {
  const { content, objects } = fixture();
  const folder = await content.createFolder(KB, "specs");
  assert.ok(folder.ok);
  const r = await uploadDocument(
    { kbId: KB, workspaceId: WS, folderId: folder.value.id, title: "s.md", mime: "text/markdown", bytes: bytes("x") },
    content,
    objects,
  );
  assert.ok(r.ok && r.value.folderId === folder.value.id);
});

test("a folder from another KB cannot be used to file a document", async () => {
  const { content, objects } = fixture();
  const otherFolder = await content.createFolder("kb_OTHER", "f");
  assert.ok(otherFolder.ok);
  const r = await uploadDocument(
    { kbId: KB, workspaceId: WS, folderId: otherFolder.value.id, title: "x", mime: "text/plain", bytes: bytes("x") },
    content,
    objects,
  );
  assert.deepEqual(r, { ok: false, error: { code: "folder_not_in_kb" } });
});

test("an uploaded document can be downloaded byte-for-byte", async () => {
  const { content, objects } = fixture();
  const up = await uploadDocument(
    { kbId: KB, workspaceId: WS, title: "d", mime: "text/plain", bytes: bytes("round trip") },
    content,
    objects,
  );
  assert.ok(up.ok);
  const dl = await downloadDocument(up.value.id, content, objects);
  assert.ok(dl);
  assert.equal(dl!.bytes.toString("utf8"), "round trip");
  assert.equal(dl!.doc.id, up.value.id);
});

test("a just-uploaded (still processing) document can be deleted", async () => {
  // The user requirement: 删 must work on a document you just uploaded, before
  // any processing has advanced it. A soft-deleted document leaves the live set.
  const { content, objects } = fixture();
  const up = await uploadDocument({ kbId: KB, workspaceId: WS, title: "d", mime: "text/plain", bytes: bytes("z") }, content, objects);
  assert.ok(up.ok);
  assert.equal((await content.listDocuments(KB)).length, 1);
  const del = await content.transitionDocument(up.value.id, "deleted");
  assert.ok(del.ok, "deleting a processing document is allowed");
  assert.equal((await content.listDocuments(KB)).length, 0, "soft-deleted leaves the live set");
});
