import { test } from "node:test";
import assert from "node:assert/strict";
import { BindingService } from "./binding-service";
import { InMemoryBindingStore } from "./binding-store";

function svc() {
  return new BindingService(new InMemoryBindingStore());
}
const base = { kbId: "kb1", connectorCode: "arda", externalSourceId: "src-1" };

test("create binds a known source: active + backfill, records the creator", async () => {
  const s = svc();
  const r = await s.create({ ...base, createdBy: "u1" });
  assert.ok(r.ok);
  assert.equal(r.value.state, "active");
  assert.equal(r.value.mode, "backfill");
  assert.equal(r.value.createdBy, "u1");
});

test("create refuses an unknown connector and a duplicate source", async () => {
  const s = svc();
  assert.equal((await s.create({ ...base, connectorCode: "nope" })).ok, false);
  const first = await s.create(base);
  assert.ok(first.ok);
  const dup = await s.create(base);
  assert.ok(!dup.ok);
  assert.equal(dup.error.code, "binding_exists");
});

test("lifecycle: active <-> paused, then revoke is terminal", async () => {
  const s = svc();
  const created = await s.create(base);
  assert.ok(created.ok);
  const id = created.value.id;

  assert.equal((await s.pause(id)).ok && (await s.get(id)).ok, true);
  assert.equal((await (await svc()).get("x")).ok, false); // sanity: unknown id

  const paused = await s.get(id);
  assert.ok(paused.ok);
  assert.equal(paused.value.state, "paused");

  const resumed = await s.resume(id);
  assert.ok(resumed.ok);
  assert.equal(resumed.value.state, "active");

  const revoked = await s.revoke(id);
  assert.ok(revoked.ok);
  assert.equal(revoked.value.state, "revoked");

  // terminal: cannot leave revoked
  const bad = await s.pause(id);
  assert.ok(!bad.ok);
  assert.equal(bad.error.code, "illegal_transition");

  // idempotent: revoking again is a no-op success
  const again = await s.revoke(id);
  assert.ok(again.ok);
  assert.equal(again.value.state, "revoked");
});

test("promoteToIncremental moves a completed backfill to steady state", async () => {
  const s = svc();
  const created = await s.create(base);
  assert.ok(created.ok);
  const r = await s.promoteToIncremental(created.value.id);
  assert.ok(r.ok);
  assert.equal(r.value.mode, "incremental");
  // idempotent
  assert.equal((await s.promoteToIncremental(created.value.id)).ok, true);
});

test("transitions and gets on a missing binding are not_found", async () => {
  const s = svc();
  assert.equal((await s.pause("missing")).ok, false);
  assert.equal((await s.get("missing")).ok, false);
});
