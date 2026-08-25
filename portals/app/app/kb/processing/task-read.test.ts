import test from "node:test";
import assert from "node:assert/strict";
import { dotsFor, statusFor, tallyTasks, type TaskRow } from "./task-read";

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);
const MIN = 60_000;

function task(over: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    documentId: "doc-1",
    kbId: "kb-1",
    kbName: "投标知识库",
    documentTitle: "标书.pdf",
    tier: "interactive",
    state: "running",
    currentStage: "parse",
    failureClass: null,
    failureReason: null,
    attempt: 1,
    createdInProduct: "karda",
    queuedAt: new Date(NOW - 5 * MIN),
    startedAt: new Date(NOW - 4 * MIN),
    finishedAt: null,
    stages: [],
    ...over,
  };
}

// --- the dot row ------------------------------------------------------------

test("closed stages read done, the current one reads active while running", () => {
  const dots = dotsFor({
    state: "running",
    currentStage: "chunk",
    stages: [
      { stage: "fetch", outcome: "ok" },
      { stage: "parse", outcome: "ok" },
    ],
  });
  assert.deepEqual(dots, ["done", "done", "active", "todo", "todo"]);
});

test("a PARKED task shows warn, not active - a parked fleet must not look busy", () => {
  const dots = dotsFor({
    state: "suspended",
    currentStage: "embed",
    stages: [
      { stage: "fetch", outcome: "ok" },
      { stage: "parse", outcome: "ok" },
      { stage: "chunk", outcome: "ok" },
    ],
  });
  assert.deepEqual(dots, ["done", "done", "done", "warn", "todo"]);
});

test("a failed stage keeps its fail dot even after the task moved on", () => {
  const dots = dotsFor({
    state: "failed",
    currentStage: "parse",
    stages: [
      { stage: "fetch", outcome: "ok" },
      { stage: "parse", outcome: "failed" },
    ],
  });
  assert.deepEqual(dots, ["done", "fail", "todo", "todo", "todo"]);
});

test("steward-assisted stages get the ai dot, not a plain done", () => {
  const dots = dotsFor({ state: "running", currentStage: "weave", stages: [{ stage: "parse", outcome: "ai_assisted" }] });
  assert.equal(dots[1], "ai");
});

test("a skipped stage counts as passed - the pipeline moved through it", () => {
  const dots = dotsFor({ state: "running", currentStage: "chunk", stages: [{ stage: "fetch", outcome: "skipped" }] });
  assert.equal(dots[0], "done");
});

// --- status -----------------------------------------------------------------

test("a suspended quota task is NOT painted as an error - it resumes on its own", () => {
  const s = statusFor(task({ state: "suspended", failureClass: "quota" }));
  assert.equal(s.statusTone, "warning");
  assert.match(s.statusLabel, /配额/);
});

test("a retry says which attempt it is", () => {
  assert.match(statusFor(task({ state: "queued", attempt: 3 })).statusLabel, /第 3 次/);
  assert.equal(statusFor(task({ state: "queued", attempt: 1 })).statusLabel, "排队中");
});

// --- the tally --------------------------------------------------------------

test("inflight counts queued AND running - both are work in progress", () => {
  const t = tallyTasks([task({ state: "queued" }), task({ state: "running" }), task({ state: "suspended" })], NOW);
  assert.equal(t.counts.inflight, 2);
  assert.equal(t.counts.suspended, 1);
});

test("failure classes count parked tasks too - a quota park IS a quota failure", () => {
  const t = tallyTasks(
    [
      task({ state: "failed", failureClass: "permanent" }),
      task({ state: "suspended", failureClass: "quota" }),
      task({ state: "queued", failureClass: "transient" }), // waiting to retry
    ],
    NOW,
  );
  assert.deepEqual(t.failures, { transient: 0, permanent: 1, quota: 1 });
});

test("docsToday counts the trailing 24h of finished work", () => {
  const t = tallyTasks(
    [
      task({ state: "done", finishedAt: new Date(NOW - 60 * MIN) }),
      task({ state: "done", finishedAt: new Date(NOW - 25 * 60 * MIN) }),
    ],
    NOW,
  );
  assert.equal(t.throughput.docsToday, 1);
});

test("p95 is queued-to-finished, not stage time - it is what a user waits", () => {
  const rows = Array.from({ length: 10 }, (_, i) =>
    task({
      state: "done",
      queuedAt: new Date(NOW - (10 + i) * MIN),
      finishedAt: new Date(NOW - i * MIN),
    }),
  );
  const t = tallyTasks(rows, NOW);
  assert.equal(t.throughput.p95Seconds, 600); // the slowest: 10 minutes
});

test("throughput is the last hour, not the day divided by 1440", () => {
  // A burst an hour ago and a steady trickle are different operations pictures;
  // dividing the day flattens both to the same number.
  const rows = Array.from({ length: 30 }, () => task({ state: "done", finishedAt: new Date(NOW - 10 * MIN) }));
  assert.equal(tallyTasks(rows, NOW).throughput.docsPerMin, 0.5);
});

test("queue depth splits by tier and counts only live work", () => {
  const t = tallyTasks(
    [
      task({ state: "queued", tier: "interactive" }),
      task({ state: "running", tier: "sync" }),
      task({ state: "queued", tier: "bulk" }),
      task({ state: "done", tier: "bulk", finishedAt: new Date(NOW) }),
    ],
    NOW,
  );
  assert.deepEqual(t.queueDepth, { interactive: 1, sync: 1, bulk: 1 });
});

test("stage P95 is measured per stage from the stage rows", () => {
  const rows = [
    task({
      stages: [
        { stage: "fetch", outcome: "ok", startedAt: new Date(NOW - 10_000), endedAt: new Date(NOW - 9_000) },
        { stage: "parse", outcome: "ok", startedAt: new Date(NOW - 9_000), endedAt: new Date(NOW - 4_000) },
      ],
    }),
  ];
  const t = tallyTasks(rows, NOW);
  assert.equal(t.stageP95[0], 1);
  assert.equal(t.stageP95[1], 5);
  assert.equal(t.stageP95[2], 0); // no rows for chunk - 0, not NaN
});

test("the failure alert needs a floor of attempts - 1-of-1 is 100% and means nothing", () => {
  const one = tallyTasks([task({ state: "failed", finishedAt: new Date(NOW - MIN) })], NOW);
  assert.equal(one.alert, null);

  const rows = [
    ...Array.from({ length: 4 }, () => task({ state: "failed", finishedAt: new Date(NOW - MIN) })),
    ...Array.from({ length: 6 }, () => task({ state: "done", finishedAt: new Date(NOW - MIN) })),
  ];
  const t = tallyTasks(rows, NOW);
  assert.equal(t.alert?.ratePct, 40);
  assert.equal(t.alert?.kbName, "投标知识库");
});

test("a library under the rate floor raises no alert", () => {
  const rows = [
    task({ state: "failed", finishedAt: new Date(NOW - MIN) }),
    ...Array.from({ length: 9 }, () => task({ state: "done", finishedAt: new Date(NOW - MIN) })),
  ];
  assert.equal(tallyTasks(rows, NOW).alert, null); // 10% is below the 30% floor
});

test("agentDeposit is derived from provenance, never a stored flag", () => {
  const t = tallyTasks(
    [task({ createdInProduct: "forge" }), task({ createdInProduct: "karda" }), task({ createdInProduct: null })],
    NOW,
  );
  assert.deepEqual(
    t.tasks.map((x) => x.agentDeposit),
    [true, false, false],
  );
});

test("the task list excludes finished work and is newest first", () => {
  const t = tallyTasks(
    [
      task({ state: "done", finishedAt: new Date(NOW), documentTitle: "old.pdf" }),
      task({ state: "queued", queuedAt: new Date(NOW - MIN), documentTitle: "new.pdf" }),
      task({ state: "running", queuedAt: new Date(NOW - 10 * MIN), documentTitle: "mid.pdf" }),
    ],
    NOW,
  );
  assert.deepEqual(
    t.tasks.map((x) => x.title),
    ["new.pdf", "mid.pdf"],
  );
});

test("an empty ledger produces a complete zeroed payload, never undefined", () => {
  const t = tallyTasks([], NOW);
  assert.deepEqual(t.counts, { inflight: 0, suspended: 0, failed: 0 });
  assert.deepEqual(t.stageP95, [0, 0, 0, 0, 0]);
  assert.equal(t.throughput.p95Seconds, 0);
  assert.equal(t.alert, null);
  assert.deepEqual(t.tasks, []);
});
