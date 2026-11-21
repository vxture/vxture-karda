import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PrismaUsageStore } from "./prisma-store";
import { PrismaContentStore } from "../../kb/lib/content-prisma-store";
import { getPrismaClient } from "../../lib/db";
import { flushUsage } from "./flush";
const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("isolated PostgreSQL: content commits usage atomically; failed reports survive and retry safely", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint });
  url.username = "karda_svc"; process.env.DATABASE_URL = url.toString();
  const db = await getPrismaClient(), ws = randomUUID();
  const content = new PrismaContentStore(), usage = new PrismaUsageStore();
  const kb = await db.knowledgeBase.create({ data: { workspaceId: ws, ownerType: "tenant", name: `p4-${ws}` } });
  try {
    const doc = await content.createDocument({ kbId: kb.id, title: "Acceptance document", source: "upload" });
    const key = `karda.ingest:${doc.id}`;
    const row = await db.raw.findUniqueOrThrow({ where: { idempotencyKey: key } });
    const template = await db.contentTemplate.create({ data: { templateCode: `p4-${ws}`, name: "Acceptance", scope: "org", workspaceId: ws } });
    try {
      const entry = await content.createEntry({ kbId: kb.id, contentTemplateId: template.id, templateVersion: 1, fields: {} });
      assert.equal((await db.raw.findUniqueOrThrow({ where: { idempotencyKey: `karda.ingest:${entry.id}` } })).workspaceId, ws);
      await db.entry.delete({ where: { id: entry.id } });
    } finally { await db.contentTemplate.delete({ where: { id: template.id } }); }
    assert.equal(row.workspaceId, ws); assert.equal(row.amount, 1n); assert.equal(row.flushed, false);
    await usage.record({ workspaceId: ws, metric: "karda.ingest", amount: 1, idempotencyKey: key });
    await assert.rejects(usage.record({ workspaceId: ws, metric: "karda.ingest", amount: 2, idempotencyKey: key }), /idempotency_conflict/);
    await usage.failed(key, "usage_report_http_503");
    assert.equal((await db.raw.findUniqueOrThrow({ where: { idempotencyKey: key } })).attempts, 1);
    assert.ok(!(await usage.unflushed(100)).some(r => r.idempotencyKey === key), "backoff is persisted");
    await admin.query("UPDATE local_usage.raw SET next_attempt_at=now() WHERE idempotency_key=$1", [key]);
    const selected = (await usage.unflushed(100)).filter(r => r.idempotencyKey === key);
    assert.equal(selected.length, 1);
    const isolated = { ...usage, record: usage.record.bind(usage), failed: usage.failed.bind(usage),
      markFlushed: usage.markFlushed.bind(usage), unflushed: async () => selected };
    await flushUsage({ store: isolated, consume: async () => ({ status: 200, body: { consumed: 1, remaining_total: 9 } }) });
    assert.equal((await db.raw.findUniqueOrThrow({ where: { idempotencyKey: key } })).flushed, true);
    // Deny only local usage INSERT for this service connection. A failed outbox
    // insert must roll the document insert back, rather than lose metering.
    await admin.query("REVOKE INSERT ON local_usage.raw FROM karda_svc");
    await assert.rejects(content.createDocument({ kbId: kb.id, title: "Must roll back", source: "upload" }));
    assert.equal(await db.document.count({ where: { kbId: kb.id } }), 1);
  } finally {
    await admin.query("GRANT INSERT ON local_usage.raw TO karda_svc");
    await admin.query("DELETE FROM local_usage.raw WHERE workspace_id=$1", [ws]);
    await db.document.deleteMany({ where: { kbId: kb.id } });
    await db.knowledgeBase.delete({ where: { id: kb.id } });
    await db.$disconnect(); await admin.end();
  }
});
