import { test } from "node:test";
import assert from "node:assert/strict";
import { KbService } from "./service";
import { InMemoryKbStore, type CreateKbInput } from "./store";
import type { Actor } from "./ownership";

const owner: Actor = { role: "owner", sub: "usr_a" };
const wsAdmin: Actor = { role: "ws_admin" };
const member: Actor = { role: "member" };

function svc() {
  return new KbService(new InMemoryKbStore());
}

const userKbInput = (name = "my kb"): CreateKbInput => ({
  workspaceId: "ws_1",
  ownerType: "user",
  ownerSub: "usr_a",
  name,
});

test("create rejects an inconsistent ownership shape before the DB would", () => {
  return svc()
    .create({ workspaceId: "ws_1", ownerType: "user", ownerSub: null, name: "x" })
    .then((r) => assert.deepEqual(r, { ok: false, error: { code: "invalid_ownership_shape" } }));
});

test("create defaults are private / governance off / synced-exempt", async () => {
  const r = await svc().create(userKbInput());
  assert.ok(r.ok);
  assert.equal(r.value.publishState, "private");
  assert.equal(r.value.governanceEnabled, false);
  assert.equal(r.value.exemptSyncedContent, true);
});

test("name uniqueness is enforced per workspace, ignoring soft-deleted rows", async () => {
  const s = svc();
  await s.create(userKbInput("dup"));
  assert.deepEqual(await s.create(userKbInput("dup")), { ok: false, error: { code: "name_taken" } });

  const first = await s.create(userKbInput("reuse"));
  assert.ok(first.ok);
  await s.remove(first.value.id);
  // the name is free again once the holder is soft-deleted
  assert.ok((await s.create(userKbInput("reuse"))).ok);
});

test("update cannot smuggle a publish-state change through the config path", async () => {
  const s = svc();
  const kb = await s.create(userKbInput());
  assert.ok(kb.ok);
  // The real threat is a JSON body, not a typed caller: pass an object that
  // actually carries publishState (as a route would) and assert it is dropped at
  // runtime, not merely forbidden by the compiler.
  const patched = await s.update(
    kb.value.id,
    { name: "renamed", publishState: "org_published" } as never,
  );
  assert.ok(patched.ok);
  assert.equal(patched.value.name, "renamed");
  assert.equal(patched.value.publishState, "private", "publishState must not leak through update");
});

test("a partial update does not null the columns it omits", async () => {
  const s = svc();
  const kb = await s.create(userKbInput());
  assert.ok(kb.ok);
  await s.update(kb.value.id, { governanceEnabled: true });
  const after = await s.update(kb.value.id, { name: "just a rename" });
  assert.ok(after.ok);
  assert.equal(after.value.name, "just a rename");
  assert.equal(after.value.governanceEnabled, true, "omitted column must retain its value");
  assert.equal(after.value.exemptSyncedContent, true);
});

test("rename respects uniqueness", async () => {
  const s = svc();
  await s.create(userKbInput("taken"));
  const b = await s.create(userKbInput("free"));
  assert.ok(b.ok);
  assert.deepEqual(await s.update(b.value.id, { name: "taken" }), {
    ok: false,
    error: { code: "name_taken" },
  });
});

test("publish ladder is enforced through the service, not just the pure rule", async () => {
  const s = svc();
  const kb = await s.create(userKbInput());
  assert.ok(kb.ok);
  const id = kb.value.id;

  // owner -> ws_published: allowed
  let r = await s.setPublishState(id, owner, "ws_published");
  assert.ok(r.ok && r.value.publishState === "ws_published");

  // owner -> org_published: forbidden (needs an admin)
  r = await s.setPublishState(id, owner, "org_published");
  assert.ok(!r.ok && r.error.code === "forbidden");

  // ws_admin -> org_published: allowed
  r = await s.setPublishState(id, wsAdmin, "org_published");
  assert.ok(r.ok && r.value.publishState === "org_published");

  // owner retracts to private: allowed, no admin needed
  r = await s.setPublishState(id, owner, "private");
  assert.ok(r.ok && r.value.publishState === "private");

  // a plain member cannot publish
  r = await s.setPublishState(id, member, "ws_published");
  assert.ok(!r.ok && r.error.code === "forbidden");
});

test("transfer permission is checkable but the write is intentionally absent", async () => {
  const s = svc();
  const kb = await s.create(userKbInput());
  assert.ok(kb.ok);
  assert.deepEqual(await s.canTransfer(kb.value.id, wsAdmin), { ok: true, value: true });
  const denied = await s.canTransfer(kb.value.id, owner);
  assert.ok(!denied.ok && denied.error.code === "forbidden");
  // there is deliberately no s.transferOwnership - owner_sub is column-locked.
  assert.equal((s as unknown as Record<string, unknown>).transferOwnership, undefined);
});

test("operations on a missing / soft-deleted kb report not_found", async () => {
  const s = svc();
  const kb = await s.create(userKbInput());
  assert.ok(kb.ok);
  await s.remove(kb.value.id);
  assert.deepEqual(await s.get(kb.value.id), { ok: false, error: { code: "not_found" } });
  assert.deepEqual(await s.setPublishState(kb.value.id, owner, "ws_published"), {
    ok: false,
    error: { code: "not_found" },
  });
  assert.deepEqual(await s.remove(kb.value.id), { ok: false, error: { code: "not_found" } });
});
