import { test } from "node:test";
import assert from "node:assert/strict";
import { taskDetail } from "./task-detail";
import { tallyTasks, type TaskRow } from "./task-read";

test("live detail keeps full identity and actual failure without demo facts or timings", () => {
  const row: TaskRow = { id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", documentId: "doc", kbId: "kb",
    kbName: "acceptance", documentTitle: "synthetic.md", tier: "interactive", state: "suspended",
    currentStage: "embed", failureClass: "unavailable", failureReason: "grant_missing", attempt: 2,
    createdInProduct: "karda", queuedAt: new Date(0), startedAt: new Date(1000), finishedAt: null, stages: [] };
  const detail = taskDetail(row);
  assert.equal(detail.title, "synthetic.md");
  assert.equal(detail.live, true);
  assert.equal(detail.badge, "suspended");
  assert.equal(detail.stages[3].desc, "grant_missing");
  assert.equal(detail.stages[3].state, "suspended");
  assert.ok(detail.stages.every(s => s.progressPct === undefined && s.timing === undefined && s.state !== "active"));
  assert.deepEqual(detail.cost, []);
  assert.equal(tallyTasks([row], 2000).tasks[0].id, row.id);
  row.stages = [{ stage: "fetch", outcome: "ok", startedAt: new Date(1100), endedAt: new Date(1300) }];
  assert.equal(taskDetail(row).stages[0].timing, "0.2s");
  row.startedAt = new Date(2000);
  assert.equal(taskDetail(row).stages[0].timing, undefined);
  row.stages.push({ stage: "embed", outcome: "failed", startedAt: new Date(2100), endedAt: new Date(2300) });
  assert.equal(taskDetail(row).stages[3].state, "suspended", "parked work must not appear queued or active");
  row.state = "failed";
  assert.equal(taskDetail(row).stages[3].state, "failed");
  assert.equal(taskDetail(row).stages[4].state, "todo", "unreached commit must remain pending");
  row.state = "done";
  assert.equal(taskDetail(row).stages[4].state, "todo", "task completion must not invent missing stage receipts");
  row.currentStage="extract";row.state="failed";
  assert.equal(taskDetail(row).stages.length,1);
  assert.equal(taskDetail(row).stages[0].label,"extract");
  assert.equal(taskDetail(row).stages[0].state,"failed");
});
