import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getPrismaClient } from "../../lib/db";
import { getTaskLedger } from "./task-ledger";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("stage receipts persist under service-role locks and preserve immutable openings on resume", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  url.username = "karda_svc";
  process.env.DATABASE_URL = url.toString();
  const db = await getPrismaClient();
  const kb = await db.knowledgeBase.create({ data: { workspaceId: randomUUID(), ownerType: "tenant", name: "stage-receipts" } });
  try {
    const doc = await db.document.create({ data: { kbId: kb.id, title: "synthetic.md", source: "upload" } });
    const ledger = getTaskLedger();
    await ledger.enqueued({ docId: doc.id, kbId: kb.id, tier: "interactive", attempt: 0 });
    await ledger.started(doc.id);
    await ledger.stage({ docId: doc.id, stage: "fetch", outcome: "ok", startedAt: new Date(1000), endedAt: new Date(1200) });
    await ledger.stage({ docId: doc.id, stage: "embed", outcome: "failed", startedAt: new Date(1300), endedAt: new Date(1800) });
    await ledger.settled({ docId: doc.id, state: "suspended", stage: "embed", failureClass: "unavailable", reason: "upstream_account_refused" });
    const task = await db.processingTask.findFirstOrThrow({ where: { documentId: doc.id }, include: { stages: true } });
    assert.equal(task.stages.length, 2, "receipt failures must not be silently hidden");
    assert.equal(task.state, "suspended");
    await ledger.started(doc.id);
    await ledger.stage({ docId: doc.id, stage: "embed", outcome: "ok", startedAt: new Date(5000), endedAt: new Date(5500) });
    const stage = await db.processingTaskStage.findUniqueOrThrow({ where: { taskId_stage: { taskId: task.id, stage: "embed" } } });
    assert.equal(stage.startedAt.getTime(), 1300, "service role must not rewrite immutable started_at");
    assert.equal(stage.endedAt?.getTime(), 5500);
    assert.equal(stage.outcome, "ok", "resumed receipt updates permitted closing fields");
  } finally {
    await db.knowledgeBase.delete({ where: { id: kb.id } });
    await db.$disconnect();
  }
});
