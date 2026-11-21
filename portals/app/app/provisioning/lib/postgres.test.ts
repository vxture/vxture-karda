import { publishWorkspaceRevision, readWorkspaceRevision } from "../../events/outbox";
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { applySnapshot } from "./reconcile";
import { Pool } from "pg";
import { PrismaProvisioningStore } from "./prisma-store";
import { handleProvisioning, type ProvisioningEvent } from "./handler";
import { getPrismaClient } from "../../lib/db";
const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("isolated PostgreSQL: atomic duplicates, tenant anchor, stale ordering and rollback", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint });
  const service = new URL(endpoint!); service.username = "karda_svc";
  process.env.DATABASE_URL = service.toString();
  const db = await getPrismaClient();
  const ws = randomUUID(), org = randomUUID(), wsRollback = randomUUID();
  const prefix = `p3-${randomUUID()}`;
  const event: ProvisioningEvent = { id: `${prefix}-first`, application: "karda", type: "tenant.provisioned",
    workspace_id: ws, tenant_id: org, seq: 6, occurred_at: 1000 };
  const deps = { store: new PrismaProvisioningStore(), product: "karda" };
  try {
    // Existing tenant_id is an immutable nullable legacy reference. Recover it
    // into a new immutable anchor, without granting tenant_id UPDATE.
    await admin.query("INSERT INTO vx_provision.app_instance(workspace_id, product_code, status) VALUES($1, 'karda', 'provisioned')", [ws]);
    const results = await Promise.all(Array.from({ length: 6 }, () => handleProvisioning(event, deps)));
    assert.equal(results.filter(r => r.handled).length, 1);
    assert.equal(await readWorkspaceRevision(ws), "1", "duplicate delivery advances the durable generation once");
    assert.equal((await db.provisionAnchor.findUnique({ where: { workspaceId_productCode: { workspaceId: ws, productCode: "karda" } } }))?.tenantId, org);
    await assert.rejects(db.provisionAnchor.updateMany({ where: { workspaceId: ws }, data: { tenantId: randomUUID() } }));
    // Same-version reconciliation can safely restore an immutable anchor.
    await applySnapshot({ workspace_id: ws, tenant_id: org, state: "provisioned", seq: 6,
      updated_at: "2026-11-22T00:00:00Z" }, deps.store);
    const stopped = { ...event, id: `${prefix}-stop`, type: "tenant.deprovisioned", seq: 8 };
    await handleProvisioning(stopped, deps);
    assert.equal((await handleProvisioning({ ...event, id: `${prefix}-late`, seq: 7 }, deps)).reason, "stale");
    await applySnapshot({ workspace_id: ws, tenant_id: org, state: "provisioned", seq: 7,
      updated_at: "2026-11-22T00:00:00Z" }, deps.store);
    assert.equal((await db.appInstance.findFirst({ where: { workspaceId: ws } }))?.status, "deprovisioned");
    await handleProvisioning({ ...event, id: `${prefix}-notify`, type: "subscription_changed", seq: undefined }, deps);
    assert.equal(await deps.store.getLastSeq(ws, "karda"), 8);
    assert.equal(await readWorkspaceRevision(ws), "3", "stale and unchanged snapshots never manufacture changes");
    await assert.rejects(db.accessRevision.updateMany({ where: { workspaceId: ws }, data: { workspaceId: randomUUID() } }));
    await assert.rejects(db.accessRevision.deleteMany({ where: { workspaceId: ws } }));
    await assert.rejects(publishWorkspaceRevision(ws, async () => { throw new Error("redis_offline"); }));
    assert.equal((await db.accessRevision.findUnique({ where: { workspaceId: ws } }))?.publishedGeneration, 0n);
    await publishWorkspaceRevision(ws, async (_ws, revision) => {
      assert.equal(revision, "3");
      await db.accessRevision.update({ where: { workspaceId: ws }, data: { generation: { increment: 1 } } });
    });
    assert.equal((await db.accessRevision.findUnique({ where: { workspaceId: ws } }))?.publishedGeneration, 0n, "late acknowledgement cannot clear a newer pending generation");
    await publishWorkspaceRevision(ws, async (_ws, revision) => { assert.equal(revision, "4"); });
    assert.equal((await db.accessRevision.findUnique({ where: { workspaceId: ws } }))?.publishedGeneration, 4n);
    await assert.rejects(handleProvisioning({ ...event, workspace_id: wsRollback }, deps), /delivery_conflict/);
    await assert.rejects(handleProvisioning({ ...event, id: `${prefix}-fail`, workspace_id: wsRollback },
      { ...deps, onProvisioned: () => { throw new Error("injected failure"); } }));
    assert.equal(await db.appInstance.count({ where: { workspaceId: wsRollback } }), 0);
    assert.equal(await db.provisionAnchor.count({ where: { workspaceId: wsRollback } }), 0);
    assert.equal(await readWorkspaceRevision(wsRollback), "0", "rollback cannot leave an invalidation behind");
    assert.equal(await deps.store.isDelivered(`${prefix}-fail`), false);
    assert.equal(await deps.store.getLastSeq(wsRollback, "karda"), -1);
  } finally {
    await admin.query("DELETE FROM vx_provision.webhook_delivery WHERE delivery_id LIKE $1", [`${prefix}%`]);
    for (const table of ["access_revision", "provision_anchor", "app_instance", "provision_seq"]) {
      await admin.query(`DELETE FROM vx_provision.${table} WHERE workspace_id = ANY($1::uuid[])`, [[ws, wsRollback]]);
    }
    await db.$disconnect(); await admin.end();
  }
});
