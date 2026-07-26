import { test } from "node:test";
import assert from "node:assert/strict";
import { InMemoryAttachmentStore } from "./store";

const key = (over = {}) => ({ workspaceId: "ws1", userSub: "u1", productCode: "agent", kbId: "kb1", ...over });

test("attach is idempotent; detach reports whether a row was removed", async () => {
  const s = new InMemoryAttachmentStore();
  await s.attach(key());
  await s.attach(key()); // no-op
  assert.equal(await s.isAttached(key()), true);
  assert.equal((await s.listKbIds("ws1", "u1", "agent")).length, 1, "not double-counted");
  assert.equal(await s.detach(key()), true);
  assert.equal(await s.detach(key()), false, "second detach removes nothing");
  assert.equal(await s.isAttached(key()), false);
});

test("attachments are scoped by (workspace, user, product) - detach in one product leaves the other", async () => {
  const s = new InMemoryAttachmentStore();
  await s.attach(key({ productCode: "agentA" }));
  await s.attach(key({ productCode: "agentB" }));
  await s.attach(key({ userSub: "u2", productCode: "agentA" }));

  assert.deepEqual(await s.listKbIds("ws1", "u1", "agentA"), ["kb1"]);
  assert.deepEqual(await s.listKbIds("ws1", "u1", "agentB"), ["kb1"]);
  assert.deepEqual(await s.listKbIds("ws1", "u2", "agentA"), ["kb1"]);
  assert.deepEqual(await s.listKbIds("ws1", "u1", "other"), []);

  await s.detach(key({ productCode: "agentA" }));
  assert.equal(await s.isAttached(key({ productCode: "agentA" })), false);
  assert.equal(await s.isAttached(key({ productCode: "agentB" })), true, "other product untouched");
});
