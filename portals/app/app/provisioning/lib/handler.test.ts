import { test } from "node:test";
import assert from "node:assert/strict";
import { handleProvisioning, type ProvisioningEvent } from "./handler";
import { InMemoryProvisioningStore } from "./store";

const PRODUCT = "raven";

function ev(over: Partial<ProvisioningEvent>): ProvisioningEvent {
  return {
    id: "d1",
    type: "tenant.provisioned",
    seq: 1,
    workspace_id: "ws_1",
    application: PRODUCT,
    tenant_id: "org_1",
    ...over,
  };
}

function deps(over: Partial<Parameters<typeof handleProvisioning>[1]> = {}) {
  return { store: new InMemoryProvisioningStore(), product: PRODUCT, ...over };
}

test("provisioned is handled once; a duplicate delivery is a no-op", async () => {
  const d = deps();
  const first = await handleProvisioning(ev({ id: "d1", seq: 1 }), d);
  assert.equal(first.handled, true);
  const dup = await handleProvisioning(ev({ id: "d1", seq: 1 }), d);
  assert.equal(dup.handled, false);
  assert.equal(dup.reason, "duplicate");
});

test("a stale/earlier seq is ignored", async () => {
  const d = deps();
  await handleProvisioning(ev({ id: "a", seq: 5 }), d);
  const stale = await handleProvisioning(ev({ id: "b", seq: 3 }), d);
  assert.equal(stale.handled, false);
  assert.equal(stale.reason, "stale");
});

test("an event for another product is rejected", async () => {
  const res = await handleProvisioning(ev({ application: "other" }), deps());
  assert.equal(res.reason, "wrong-product");
});

test("subscription_changed evicts the C2 cache", async () => {
  let evicted: string | null = null;
  await handleProvisioning(
    ev({ id: "s1", type: "subscription_changed", seq: undefined, workspace_id: "ws_9" }),
    deps({ onSubscriptionChanged: (ws) => (evicted = ws) }),
  );
  assert.equal(evicted, "ws_9");
});

test("provisioned runs the re-entrant init hook", async () => {
  let inited: string | null = null;
  const res = await handleProvisioning(
    ev({ id: "p1", type: "tenant.provisioned" }),
    deps({ onProvisioned: (ws) => { inited = ws; } }),
  );
  assert.equal(res.handled, true);
  assert.equal(inited, "ws_1");
});

test("versionless notifications cannot be suppressed by lifecycle watermark", async () => {
  const d = deps(); let count = 0; d.onSubscriptionChanged = () => { count++; };
  await handleProvisioning(ev({ id: "life", seq: 999 }), d);
  for (const id of ["notify-a", "notify-b"]) {
    assert.equal((await handleProvisioning(ev({ id, type: "grant.invalidated", seq: undefined }), d)).handled, true);
  }
  assert.equal(await d.store.getLastSeq("ws_1", PRODUCT), 999);
  assert.equal(count, 3);
});
test("parallel duplicate delivery applies initialization once", async () => {
  let calls = 0;
  const d = deps({ onProvisioned: async () => { calls++; await new Promise(r => setTimeout(r, 5)); } });
  const results = await Promise.all(Array.from({ length: 5 }, () => handleProvisioning(ev({}), d)));
  assert.equal(calls, 1); assert.equal(results.filter(r => r.handled).length, 1);
});
test("failure rolls back receipt, instance and watermark so retry can succeed", async () => {
  const d = deps({ onProvisioned: () => { throw new Error("failed init"); } });
  await assert.rejects(handleProvisioning(ev({}), d));
  assert.equal(await d.store.isDelivered("d1"), false);
  assert.equal(await d.store.getLastSeq("ws_1", PRODUCT), -1);
  d.onProvisioned = undefined;
  assert.equal((await handleProvisioning(ev({}), d)).handled, true);
});
test("a delivery id cannot be replayed with a different signed workspace or tenant", async () => {
  const d = deps(); await handleProvisioning(ev({}), d);
  await assert.rejects(handleProvisioning(ev({ workspace_id: "other" }), d), /delivery_conflict/);
  await assert.rejects(handleProvisioning(ev({ tenant_id: "other" }), d), /delivery_conflict/);
});
test("new lifecycle event cannot change an established tenant anchor", async () => {
  const d = deps(); await handleProvisioning(ev({}), d);
  await assert.rejects(handleProvisioning(ev({ id: "new", seq: 2, tenant_id: "other" }), d), /tenant_conflict/);
  assert.equal(await d.store.isDelivered("new"), false);
});
