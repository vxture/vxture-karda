import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { getPrismaClient } from "../../lib/db";
import { createWithinLibraryCapacity } from "./capacity";
import { PrismaKbStore } from "./prisma-store";
import { KbService } from "./service";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("isolated PostgreSQL: concurrent library writes obey capacity and release on rollback/delete", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint });
  url.username = "karda_svc"; process.env.DATABASE_URL = url.toString();
  const db = await getPrismaClient(), ws = randomUUID(), other = randomUUID();
  const service = new KbService(new PrismaKbStore(async () => 2));
  const input = (workspaceId: string, name: string) => ({ workspaceId, name, ownerType: "tenant" as const, ownerSub: null });
  try {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => service.create(input(ws, `concurrent-${i}`))));
    assert.equal(results.filter(r => r.ok).length, 2);
    assert.equal(results.filter(r => !r.ok && r.error.code === "capacity_exceeded").length, 6);
    assert.equal(await db.knowledgeBase.count({ where: { workspaceId: ws, deletedAt: null } }), 2);
    assert.ok((await service.create(input(other, "independent"))).ok, "another workspace has its own capacity");
    const row = await db.knowledgeBase.findFirstOrThrow({ where: { workspaceId: ws } });
    await new PrismaKbStore().softDeleteKb(row.id);
    await assert.rejects(createWithinLibraryCapacity(ws, async tx => {
      await tx.knowledgeBase.create({ data: input(ws, "rollback") });
      throw new Error("injected_rollback");
    }, async () => 2), /injected_rollback/);
    assert.equal(await db.knowledgeBase.count({ where: { workspaceId: ws, name: "rollback" } }), 0);
    assert.ok((await service.create(input(ws, "reuse-deleted-slot"))).ok);
    const denied = new KbService(new PrismaKbStore(async () => undefined));
    assert.deepEqual(await denied.create(input(other, "missing-config")), {
      ok: false, error: { code: "capacity_unconfigured", metric: "kb.max" },
    });
    const failing = new KbService(new PrismaKbStore(async () => { throw new Error("private-internal-detail"); }));
    assert.deepEqual(await failing.create(input(other, "upstream-failed")), {
      ok: false, error: { code: "capacity_unavailable", metric: "kb.max" },
    });
    const zero = new KbService(new PrismaKbStore(async () => 0));
    assert.equal((await zero.create(input(other, "zero"))).ok, false);
    const unlimited = new KbService(new PrismaKbStore(async () => -1));
    assert.ok((await unlimited.create(input(other, "unlimited"))).ok);
  } finally {
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE workspace_id = ANY($1::uuid[])", [[ws, other]]);
    await db.$disconnect(); await admin.end();
  }
});
