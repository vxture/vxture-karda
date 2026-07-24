import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilesystemObjectStore,
  InMemoryObjectStore,
  contentHashOf,
} from "./objectstore";

test("content hash is stable and content-addressed", () => {
  const a = contentHashOf(Buffer.from("hello"));
  const b = contentHashOf(Buffer.from("hello"));
  const c = contentHashOf(Buffer.from("world"));
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test("in-memory store round-trips bytes and dedups by content", async () => {
  const s = new InMemoryObjectStore();
  const o1 = await s.put("ws", "kb", Buffer.from("same"));
  const o2 = await s.put("ws", "kb", Buffer.from("same"));
  assert.equal(o1.key, o2.key, "same content -> same key");
  assert.equal(s.size, 1, "identical bytes are not doubled");
  const got = await s.get(o1.key);
  assert.equal(got?.toString("utf8"), "same");
});

test("filesystem store writes, reads, and deletes", async () => {
  const root = await mkdtemp(join(tmpdir(), "karda-obj-"));
  try {
    const s = new FilesystemObjectStore(root);
    const o = await s.put("ws1", "kb1", Buffer.from("file bytes"));
    assert.equal(o.sizeBytes, 10);
    assert.ok(await s.exists(o.key));
    const got = await s.get(o.key);
    assert.equal(got?.toString("utf8"), "file bytes");
    assert.ok(await s.delete(o.key));
    assert.equal(await s.get(o.key), null, "gone after delete");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("filesystem store is content-addressed: same bytes reuse the same object", async () => {
  const root = await mkdtemp(join(tmpdir(), "karda-obj-"));
  try {
    const s = new FilesystemObjectStore(root);
    const a = await s.put("ws", "kb", Buffer.from("dup"));
    const b = await s.put("ws", "kb", Buffer.from("dup"));
    assert.equal(a.key, b.key);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a key containing traversal is refused", async () => {
  const s = new FilesystemObjectStore("/tmp/whatever");
  await assert.rejects(() => s.get("../../etc/passwd"), /invalid object key/);
});

test("get of an unknown key returns null, not an error", async () => {
  const root = await mkdtemp(join(tmpdir(), "karda-obj-"));
  try {
    const s = new FilesystemObjectStore(root);
    assert.equal(await s.get("ws/kb/ab/nope"), null);
    assert.equal(await s.delete("ws/kb/ab/nope"), false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
