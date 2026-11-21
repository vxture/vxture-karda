import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getPrismaClient } from "../../lib/db";
import { PrismaContentStore } from "./content-prisma-store";
import { PrismaBindingStore } from "../connectors/binding-store";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("isolated PostgreSQL: content and binding capacity serialize mixed writers and retain paused slots", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint });
  url.username = "karda_svc"; process.env.DATABASE_URL = url.toString();
  const db = await getPrismaClient(), ws = randomUUID(), other = randomUUID();
  const kb = await db.knowledgeBase.create({ data: { workspaceId: ws, ownerType: "tenant", name: "capacity-content" } });
  const kb2 = await db.knowledgeBase.create({ data: { workspaceId: other, ownerType: "tenant", name: "capacity-other" } });
  const template = await db.contentTemplate.create({ data: { templateCode: `capacity-${ws}`, name: "Capacity", scope: "org", workspaceId: ws } });
  const content = new PrismaContentStore(async (_ws, metric) => { assert.equal(metric, "document.max"); return 3; });
  const bindings = new PrismaBindingStore(async (_ws, metric) => { assert.equal(metric, "binding.max"); return 2; });
  try {
    const results = await Promise.allSettled(Array.from({ length: 10 }, (_, i) => i % 2
      ? content.createDocument({ kbId: kb.id, title: `doc-${i}`, source: "api" })
      : content.createEntry({ kbId: kb.id, contentTemplateId: template.id, templateVersion: 1, fields: {} })));
    assert.equal(results.filter(r => r.status === "fulfilled").length, 3);
    assert.equal(results.filter(r => r.status === "rejected" && r.reason.code === "capacity_exceeded").length, 7);
    assert.equal(await db.raw.count({ where: { workspaceId: ws } }), 3, "refused writes create no usage events");
    const doc = await db.document.findFirst({ where: { kbId: kb.id } });
    const entry = await db.entry.findFirst({ where: { kbId: kb.id } });
    if (doc) await content.setDocumentState(doc.id, "archived");
    else await content.setEntryState(entry!.id, "archived");
    await assert.rejects(content.createDocument({ kbId: kb.id, title: "archived-slot", source: "api" }), { code: "capacity_exceeded" });
    if (doc) await content.setDocumentState(doc.id, "deleted");
    else await content.setEntryState(entry!.id, "deleted");
    await content.createDocument({ kbId: kb.id, title: "reclaimed", source: "api" });
    await content.createDocument({ kbId: kb2.id, title: "independent", source: "api" });
    const limited = new PrismaContentStore(async () => 2);
    const original = await limited.createDocument({ kbId: kb2.id, title: "connector-original", source: "connector", connectorCode: "arda",
      sourceRef: { source_doc_id: "stable-source", binding_id: "stable-binding" } });
    const replacement = { kbId: kb2.id, title: "connector-replacement", source: "connector" as const, connectorCode: "arda",
      supersedesDocumentId: original.id, sourceRef: { source_doc_id: "stable-source", binding_id: "stable-binding" } };
    await assert.rejects(limited.createDocument({ ...replacement, folderId: randomUUID() }));
    assert.ok(await limited.getDocument(original.id), "insert failure rolls back the old-row tombstone");
    const replaced = await limited.createDocument(replacement);
    assert.equal(await limited.getDocument(original.id), null);
    assert.ok(await limited.getDocument(replaced.id), "a net-zero replacement works at the limit");
    await assert.rejects(limited.createDocument({ ...replacement, supersedesDocumentId: replaced.id,
      sourceRef: { source_doc_id: "foreign-source", binding_id: "stable-binding" } }), /connector_supersede_conflict/);
    assert.ok(await limited.getDocument(replaced.id), "a mismatched replacement cannot reclaim a foreign slot");
    const bindResults = await Promise.allSettled(Array.from({ length: 7 }, (_, i) => bindings.create({ kbId: kb.id, connectorCode: "arda", externalSourceId: `source-${i}` })));
    assert.equal(bindResults.filter(r => r.status === "fulfilled").length, 2);
    assert.equal(bindResults.filter(r => r.status === "rejected" && r.reason.code === "capacity_exceeded").length, 5);
    const binding = await db.binding.findFirstOrThrow({ where: { kbId: kb.id } });
    await bindings.setState(binding.id, "paused");
    await assert.rejects(bindings.create({ kbId: kb.id, connectorCode: "arda", externalSourceId: "paused-retains-slot" }), { code: "capacity_exceeded" });
    await bindings.setState(binding.id, "active");
    await Promise.all([bindings.setState(binding.id, "revoked"), bindings.setState(binding.id, "active")]);
    assert.equal((await bindings.get(binding.id))?.state, "revoked", "late resume cannot resurrect revoked binding");
    assert.equal(await bindings.setState(binding.id, "active"), null);
    await bindings.create({ kbId: kb.id, connectorCode: "arda", externalSourceId: "released-slot" });
    const missing = new PrismaContentStore(async () => undefined);
    await assert.rejects(missing.createDocument({ kbId: kb2.id, title: "missing", source: "api" }), { code: "capacity_unconfigured", metric: "document.max" });
    const missingBindings = new PrismaBindingStore(async () => undefined);
    await assert.rejects(missingBindings.create({ kbId: kb2.id, connectorCode: "arda", externalSourceId: "missing" }), { code: "capacity_unconfigured", metric: "binding.max" });
    assert.equal(await db.raw.count({ where: { workspaceId: ws } }), 4);
  } finally {
    await admin.query("DELETE FROM local_usage.raw WHERE workspace_id = ANY($1::uuid[])", [[ws, other]]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE workspace_id = ANY($1::uuid[])", [[ws, other]]);
    await admin.query("DELETE FROM karda_kb.content_template WHERE id=$1", [template.id]);
    await db.$disconnect(); await admin.end();
  }
});
