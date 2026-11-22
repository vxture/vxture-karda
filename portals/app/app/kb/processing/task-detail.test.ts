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
  assert.ok(detail.stages.every(s => s.progressPct === undefined && s.timing === undefined && s.state !== "active"));
  assert.deepEqual(detail.cost, []);
  assert.equal(tallyTasks([row], 2000).tasks[0].id, row.id);
});
