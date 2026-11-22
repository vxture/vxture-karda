import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getPrismaClient } from "../../lib/db";
import { ReservedObjectStore } from "./reservations";
import { InMemoryObjectStore } from "./objectstore";
import { PrismaContentStore } from "../lib/content-prisma-store";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("isolated PostgreSQL: durable byte reservation, shared references, interrupted PUT and cleanup fencing", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint });
  url.username = "karda_svc"; process.env.DATABASE_URL = url.toString();
  const db = await getPrismaClient(), ws = randomUUID(), other = randomUUID();
  const kb = await db.knowledgeBase.create({ data: { workspaceId: ws, ownerType: "tenant", name: "storage-reservations" } });
  const second = await db.knowledgeBase.create({ data: { workspaceId: other, ownerType: "tenant", name: "storage-other" } });
  const raw = new InMemoryObjectStore(), store = new ReservedObjectStore(raw, async (_ws, metric) => { assert.equal(metric, "storage.bytes"); return 6; });
  const content = new PrismaContentStore(async () => -1);
  const expire = async (workspaceId: string) => admin.query("UPDATE karda_kb.stored_object SET retain_until=now()-interval '2 hours', retry_at=now()-interval '1 hour' WHERE workspace_id=$1", [workspaceId]);
  try {
    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => store.put(ws, kb.id, Buffer.from(`xx${i}`))));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 2);
    assert.equal(raw.size, 2, "capacity refuses BEFORE writing physical bytes");
    const rows = await db.storedObject.findMany({ where: { workspaceId: ws } });
    assert.equal(rows.reduce((sum, r) => sum + r.sizeBytes, 0n), 6n);
    const bytes = await raw.get(rows[0].objectKey);
    const reused = await store.put(ws, kb.id, bytes!);
    assert.equal(reused.key, rows[0].objectKey, "identical content reuses already charged bytes");
    assert.equal(await db.storedObject.count({ where: { workspaceId: ws } }), 2);
    const doc = await content.createDocument({ kbId: kb.id, title: "reference", source: "upload", storageRef: reused.key, sizeBytes: reused.sizeBytes });
    const shared = await content.createDocument({ kbId: kb.id, title: "shared", source: "api", storageRef: reused.key, sizeBytes: reused.sizeBytes });
    await content.setDocumentState(doc.id, "deleted");
    await content.setDocumentState(shared.id, "deleted");
    await expire(ws);
    const cleaned = await store.recover(100);
    assert.equal(cleaned.deleted, 1, "only the unreferenced object is deleted");
    assert.ok(await raw.get(reused.key), "even deleted documents retain their original bytes");
    assert.equal((await db.storedObject.findUniqueOrThrow({ where: { objectKey: reused.key } })).state, "ready");
    await assert.rejects(store.delete(), /storage_delete_requires_reconciliation/);
    const deleted = await db.storedObject.findFirstOrThrow({ where: { workspaceId: ws, state: "deleted" } });
    await assert.rejects(content.createDocument({ kbId: kb.id, title: "stale-ref", source: "api", storageRef: deleted.objectKey, sizeBytes: 3 }), { code: "capacity_unavailable" });
    await assert.rejects(content.createDocument({ kbId: second.id, title: "foreign-ref", source: "api", storageRef: reused.key, sizeBytes: 3 }), { code: "capacity_unavailable" });
    // A PUT that completed remotely but lost its response remains reserved.
    const interruptedRaw = new class extends InMemoryObjectStore {
      override async put(workspace: string, library: string, data: Buffer): Promise<never> {
        await super.put(workspace, library, data); throw new Error("response_lost");
      }
    }();
    const interrupted = new ReservedObjectStore(interruptedRaw, async () => 3);
    await assert.rejects(interrupted.put(other, second.id, Buffer.from("abc")), /response_lost/);
    await assert.rejects(interrupted.put(other, second.id, Buffer.from("def")), { code: "capacity_exceeded" });
    await expire(other);
    assert.equal((await interrupted.recover(100)).recovered, 1);
    const repaired = await interrupted.put(other, second.id, Buffer.from("abc"));
    assert.equal(repaired.sizeBytes, 3, "retry can reuse a hash-verified recovered object");
    // Unknown PUTs are not discarded merely because their lease elapsed.
    await admin.query("UPDATE karda_kb.stored_object SET state='pending' WHERE workspace_id=$1", [other]);
    await expire(other);
    const absent = new ReservedObjectStore(new InMemoryObjectStore(), async () => 3);
    await absent.recover(100);
    assert.equal((await db.storedObject.findFirstOrThrow({ where: { workspaceId: other } })).state, "pending");
    await assert.rejects(absent.put(other, second.id, Buffer.from("abc")), { code: "capacity_unavailable" });
    // Deleting keys are never reused. Failure cannot release bytes, and a later
    // successful retry must not delete an object from a new generation.
    await admin.query("DELETE FROM karda_kb.stored_object WHERE workspace_id=$1", [other]);
    const failingRaw = new class extends InMemoryObjectStore {
      fail = true;
      override async delete(key: string): Promise<boolean> { if (this.fail) throw new Error("delete_failed"); return super.delete(key); }
    }();
    const failing = new ReservedObjectStore(failingRaw, async () => 3);
    const orphan = await failing.put(other, second.id, Buffer.from("old"));
    await expire(other); await failing.recover(100);
    assert.equal((await db.storedObject.findUniqueOrThrow({ where: { objectKey: orphan.key } })).state, "deleting");
    await assert.rejects(failing.put(other, second.id, Buffer.from("new")), { code: "capacity_exceeded" });
    failingRaw.fail = false; await expire(other); await failing.recover(100);
    const renewed = await failing.put(other, second.id, Buffer.from("old"));
    assert.notEqual(renewed.key, orphan.key);
    // Immutable identity/byte counts are enforced by actual service grants.
    await assert.rejects(db.storedObject.updateMany({ where: { workspaceId: other }, data: { sizeBytes: 0n } }));
    await assert.rejects(db.storedObject.deleteMany({ where: { workspaceId: other } }));
    const unconfigured = new ReservedObjectStore(raw, async () => undefined);
    await assert.rejects(unconfigured.put(ws, kb.id, Buffer.from("x")), { code: "capacity_unconfigured", metric: "storage.bytes" });
    const unavailable = new ReservedObjectStore(raw, async () => { throw new Error("private-upstream-detail"); });
    await assert.rejects(unavailable.put(ws, kb.id, Buffer.from("x")), { code: "capacity_unavailable", metric: "storage.bytes" });
    await db.document.create({ data: { kbId: second.id, title: "legacy-unknown", source: "upload", storageRef: "legacy/unknown", sizeBytes: null } });
    const unlimited = new ReservedObjectStore(raw, async () => -1);
    await assert.rejects(unlimited.put(other, second.id, Buffer.from("another")), { code: "capacity_unavailable" });
  } finally {
    await admin.query("DELETE FROM local_usage.raw WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await admin.query("DELETE FROM karda_kb.stored_object WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE workspace_id=ANY($1::uuid[])", [[ws, other]]);
    await db.$disconnect(); await admin.end();
  }
});
