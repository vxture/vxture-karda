import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryCommitTarget } from "./commit";
import type { CommittedChunk } from "./orchestrator";

const chunk = (ordinal: number, text: string): CommittedChunk => ({
  ordinal,
  text,
  locator: { ordinal },
  sourceRange: { start: ordinal * 100, end: ordinal * 100 + text.length },
  tokenCount: text.split(/\s+/).length,
  vector: null,
});

test("first commit creates version 1 and it is the active set", async () => {
  const t = new InMemoryCommitTarget();
  await t.commit([chunk(0, "a"), chunk(1, "b")]);
  assert.equal(t.activeVersion(), 1);
  assert.deepEqual(t.activeChunks().map((c) => c.text), ["a", "b"]);
});

test("a re-commit bumps the version and replaces the active set atomically", async () => {
  const t = new InMemoryCommitTarget();
  await t.commit([chunk(0, "old")]);
  await t.commit([chunk(0, "new"), chunk(1, "also new")]);
  assert.equal(t.activeVersion(), 2);
  // retrieval sees ONLY the new version - never a mix
  assert.deepEqual(t.activeChunks().map((c) => c.text), ["new", "also new"]);
});

test("superseded versions are dropped - only one version is retained", async () => {
  const t = new InMemoryCommitTarget();
  await t.commit([chunk(0, "v1")]);
  await t.commit([chunk(0, "v2")]);
  await t.commit([chunk(0, "v3")]);
  assert.equal(t.activeVersion(), 3);
  assert.equal(t.versionCount(), 1, "old versions are cleaned up");
});

test("the active set never contains chunks from two versions (no half-update)", async () => {
  const t = new InMemoryCommitTarget();
  await t.commit([chunk(0, "x0"), chunk(1, "x1"), chunk(2, "x2")]);
  // a smaller new set must fully replace, not merge
  await t.commit([chunk(0, "y0")]);
  const texts = t.activeChunks().map((c) => c.text);
  assert.deepEqual(texts, ["y0"], "no leftover ordinals from the previous version");
});

test("committing an empty chunk set still advances the version", async () => {
  // a document that produced no chunks (edge case) still commits - the active
  // version advances and the previous chunks are cleared.
  const t = new InMemoryCommitTarget();
  await t.commit([chunk(0, "had content")]);
  await t.commit([]);
  assert.equal(t.activeVersion(), 2);
  assert.deepEqual(t.activeChunks(), []);
});
