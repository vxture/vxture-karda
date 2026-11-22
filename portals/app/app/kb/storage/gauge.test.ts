import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getPrismaClient } from "../../lib/db";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { StorageGauge, storageHeadroom, validateGaugeReceipt } from "./gauge";
import { ReservedObjectStore } from "./reservations";
import { InMemoryObjectStore } from "./objectstore";

test("storage gauge reads shared pool headroom, never a max limit or invented allowance", () => {
  const e = { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "karda", bundled: true,
    limits: { "storage.bytes": 9999 }, quota_pools: [
      { metric: "storage.bytes", limit: 100, remaining: -10, priority: 0 },
      { metric: "storage.bytes", limit: 50, remaining: 5, priority: 1 },
      { metric: "ai.credit", limit: 100, remaining: 100, priority: 0 }] };
  assert.equal(storageHeadroom(e), -5n);
  assert.equal(storageHeadroom({ ...e, limits: {} }), -5n, "pool-only C2 needs no storage max key");
  assert.throws(() => storageHeadroom({ ...e, quota_pools: [] }), { code: "capacity_unconfigured" });
  assert.throws(() => storageHeadroom({ ...e, bundled: false }), { code: "capacity_unavailable" });
  assert.throws(() => storageHeadroom({ ...e, quota_pools: [{ ...e.quota_pools[0], remaining: 0.5 }] }), { code: "capacity_unavailable" });
});

test("gauge acknowledgement binds exact scope, value and observation including idempotent replay", () => {
  const at = new Date("2026-11-22T00:00:00Z");
  const ack = { workspace_id: "ws", product: "karda", metric: "storage.bytes", value: "3", observed_at: at.toISOString(), applied: false };
  validateGaugeReceipt(ack, "ws", 3n, at);
  for (const patch of [{ workspace_id: "other" }, { product: "arda" }, { metric: "ai.credit" }, { value: "4" }, { observed_at: "2026-11-22T00:00:01Z" }, { applied: undefined }]) {
    assert.throws(() => validateGaugeReceipt({ ...ack, ...patch }, "ws", 3n, at), { code: "capacity_unavailable" });
  }
});

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("isolated PostgreSQL: shared storage admission, durable failed reports, restart retry and deletion snapshots", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint });
  url.username = "karda_svc"; process.env.DATABASE_URL = url.toString();
  const db = await getPrismaClient(), ws = randomUUID(), other = randomUUID();
  const kb = await db.knowledgeBase.create({ data: { workspaceId: ws, ownerType: "tenant", name: "gauge-test" } });
  const kb2 = await db.knowledgeBase.create({ data: { workspaceId: other, ownerType: "tenant", name: "gauge-other" } });
  const remote = new Map<string, { value: bigint; observed: number }>();
  let failAfterApply = false;
  const transport = {
    async report(id: string, value: bigint, at: Date) {
      const previous = remote.get(id);
      assert.ok(!previous || at.getTime() >= previous.observed, "observations never move backward");
      if (previous?.observed === at.getTime()) assert.equal(value, previous.value, "same observation is immutable");
      remote.set(id, { value, observed: at.getTime() });
      if (failAfterApply && value > 0n) throw new Error("response_lost");
    },
    async remaining(id: string) { return 9n - 3n - (remote.get(id)?.value ?? 0n); }, // other product owns3
  };
  const gauge = new StorageGauge(transport), raw = new InMemoryObjectStore();
  const store = new ReservedObjectStore(raw, undefined, gauge);
  try {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => store.put(ws, kb.id, Buffer.from(`v${i}!`))));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2);
    assert.equal(raw.size, 2);
    assert.equal(remote.get(ws)?.value, 6n, "Karda reports its own absolute bytes, not shared usage");
    assert.equal((await db.storageWatermark.findUniqueOrThrow({ where: { workspaceId: ws } })).pending, false);
    const i = results.findIndex(r => r.status === "fulfilled");
    await store.put(ws, kb.id, Buffer.from(`v${i}!`)); // full shared pool still permits dedup
    assert.equal(raw.size, 2);
    // Report can reach platform and lose its response. Do not physically PUT or
    // erase the committed reservation; a new process replays its exact snapshot.
    failAfterApply = true;
    await assert.rejects(store.put(other, kb2.id, Buffer.from("abc")), { code: "capacity_unavailable" });
    assert.equal(raw.size, 2);
    const pending = await db.storageWatermark.findUniqueOrThrow({ where: { workspaceId: other } });
    assert.equal(pending.pending, true); assert.equal(pending.value, 3n);
    assert.equal((await db.storedObject.findFirstOrThrow({ where: { workspaceId: other } })).state, "pending");
    failAfterApply = false;
    await admin.query("UPDATE karda_kb.storage_watermark SET retry_at=now()-interval '1 minute' WHERE workspace_id=$1", [other]);
    await new StorageGauge(transport).retry();
    assert.equal((await db.storageWatermark.findUniqueOrThrow({ where: { workspaceId: other } })).pending, false);
    assert.equal(remote.get(other)?.observed, pending.observedAt.getTime());
    // Confirmed physical cleanup persists a lower snapshot, then retries it.
    await admin.query("UPDATE karda_kb.stored_object SET retain_until=now()-interval '2 hours',retry_at=now()-interval '1 hour' WHERE workspace_id=$1", [ws]);
    await store.recover(100);
    await gauge.retry();
    assert.equal(remote.get(ws)?.value, 0n);
    assert.equal(remote.get(other)?.value, 3n, "other workspace's uncertain bytes remain charged");
    await db.provisionAnchor.create({ data: { workspaceId: ws, productCode: "karda", tenantId: randomUUID() } });
    await admin.query("DELETE FROM karda_kb.storage_watermark WHERE workspace_id=$1", [ws]);
    await new StorageGauge(transport).seedMissing();
    assert.equal((await db.storageWatermark.findUniqueOrThrow({ where: { workspaceId: ws } })).value, 0n,
      "legacy inventory bootstraps even when no new upload occurs");
    await assert.rejects(db.storageWatermark.deleteMany({ where: { workspaceId: ws } }));
    await assert.rejects(db.storageWatermark.update({ where: { workspaceId: ws }, data: { workspaceId: randomUUID() } }));
  } finally {
    await admin.query("DELETE FROM vx_provision.provision_anchor WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await admin.query("DELETE FROM karda_kb.storage_watermark WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await admin.query("DELETE FROM karda_kb.stored_object WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await db.$disconnect(); await admin.end();
  }
});
