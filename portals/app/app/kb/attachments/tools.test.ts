import { test } from "node:test";
import assert from "node:assert/strict";
import { createKb, attachKb, detachKb, type AttachmentToolDeps } from "./tools";
import type { CallerContext } from "../tools/s2s";
import { KbService } from "../lib/service";
import { InMemoryKbStore } from "../lib/store";
import { InMemoryAttachmentStore } from "./store";

const oboCaller = (over: Partial<CallerContext> = {}): CallerContext => ({
  callerProduct: "agent",
  org: "org1",
  workspace: "ws1",
  user: "u1",
  mode: "obo",
  ...over,
});

async function fixture() {
  const kbStore = new InMemoryKbStore();
  const attachments = new InMemoryAttachmentStore();
  const deps: AttachmentToolDeps = { kb: new KbService(kbStore), attachments };
  return { deps, kbStore, attachments };
}

test("create_kb makes a user-owned library and auto-attaches it", async () => {
  const { deps, attachments } = await fixture();
  const r = await createKb(oboCaller(), { name: "My library" }, deps);
  assert.equal(r.status, 201);
  const id = (r.body.knowledge_base as { id: string }).id;
  assert.equal(r.body.attached, true);
  assert.deepEqual(await attachments.listKbIds("ws1", "u1", "agent"), [id]);
});

test("create_kb requires a name and rejects a duplicate (409)", async () => {
  const { deps } = await fixture();
  assert.equal((await createKb(oboCaller(), {}, deps)).status, 400);
  assert.equal((await createKb(oboCaller(), { name: "dup" }, deps)).status, 201);
  const again = await createKb(oboCaller(), { name: "dup" }, deps);
  assert.equal(again.status, 409);
  assert.equal(again.body.error, "name_taken");
});

test("attach_kb attaches a visible library: owned, or published to ws/org", async () => {
  const { deps, kbStore } = await fixture();
  const mine = await kbStore.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "mine" });
  const pub = await kbStore.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u2", name: "pub" });
  await kbStore.updateKb(pub.id, { publishState: "ws_published" });

  assert.equal((await attachKb(oboCaller(), { kb_id: mine.id }, deps)).status, 200);
  assert.equal((await attachKb(oboCaller(), { kb_id: pub.id }, deps)).status, 200);
});

test("attach_kb refuses a private library owned by another, and one in another workspace (404 both)", async () => {
  const { deps, kbStore } = await fixture();
  const others = await kbStore.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u2", name: "others" });
  const foreign = await kbStore.createKb({ workspaceId: "ws2", ownerType: "user", ownerSub: "u1", name: "foreign" });

  assert.equal((await attachKb(oboCaller(), { kb_id: others.id }, deps)).status, 404, "private, not owner");
  assert.equal((await attachKb(oboCaller(), { kb_id: foreign.id }, deps)).status, 404, "other workspace");
  assert.equal((await attachKb(oboCaller(), {}, deps)).status, 400, "kb_id required");
});

test("detach_kb removes the attachment and is idempotent", async () => {
  const { deps, kbStore, attachments } = await fixture();
  const mine = await kbStore.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "mine" });
  await attachKb(oboCaller(), { kb_id: mine.id }, deps);
  assert.equal(await attachments.isAttached({ workspaceId: "ws1", userSub: "u1", productCode: "agent", kbId: mine.id }), true);

  const d = await detachKb(oboCaller(), { kb_id: mine.id }, deps);
  assert.equal(d.status, 200);
  assert.equal(d.body.attached, false);
  // idempotent: detaching again still reports not-attached
  assert.equal((await detachKb(oboCaller(), { kb_id: mine.id }, deps)).body.attached, false);
});
