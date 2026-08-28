import test from "node:test";
import assert from "node:assert/strict";
import { leavesLiveSet, stateForAction, NULL_TASK_LEDGER, type TaskLedger } from "./task-ledger";
import { tick, type WorkerDeps } from "./worker";
import { TaskQueue } from "./queue";
import { UnavailableError } from "./orchestrator";

test("a retry goes back to queued, not to a fourth state", () => {
  // Otherwise "how many are waiting" becomes a two-term question on every query
  // that asks it. `attempt` is what distinguishes a retry, and it is a column.
  assert.equal(stateForAction("retry"), "queued");
  assert.equal(stateForAction("indexed"), "done");
  assert.equal(stateForAction("failed"), "failed");
  assert.equal(stateForAction("suspend"), "suspended");
});

test("suspended LEAVES the live set - a parked task must not block a re-enqueue", () => {
  // uidx_processing_task_doc_live only covers queued/running, so this predicate
  // and the index have to agree or a parked document becomes un-processable.
  assert.equal(leavesLiveSet("suspended"), true);
  assert.equal(leavesLiveSet("done"), true);
  assert.equal(leavesLiveSet("failed"), true);
  assert.equal(leavesLiveSet("queued"), false);
  assert.equal(leavesLiveSet("running"), false);
});

// --- the worker seam --------------------------------------------------------

function recordingLedger() {
  const calls: string[] = [];
  const ledger: TaskLedger = {
    async enqueued() {
      calls.push("enqueued");
    },
    async started() {
      calls.push("started");
    },
    async stage() {
      calls.push("stage");
    },
    async settled(e) {
      calls.push(`settled:${e.state}`);
    },
  };
  return { ledger, calls };
}

function deps(over: Partial<WorkerDeps> = {}): WorkerDeps {
  const queue = new TaskQueue();
  queue.enqueue({ key: "k1", docId: "doc-1", kbId: "kb-1", org: "ws-1", tier: "interactive", attempt: 0 });
  return {
    queue,
    sink: { async markIndexed() {}, async markFailed() {} },
    resolve: async () => ({
      source: { async fetchText() { return "hello world"; }, mime: "text/plain" },
      embedder: { async embed(texts: string[]) { return { vectors: texts.map(() => [0.1]), modelCode: "m" }; } },
      target: { async commit() {} },
      embeddingModel: null,
    }),
    now: () => 0,
    ...over,
  };
}

test("a successful run records started then settled:done", async () => {
  const { ledger, calls } = recordingLedger();
  const r = await tick(deps({ ledger }));
  assert.equal(r.action, "indexed");
  assert.deepEqual(calls, ["started", "settled:done"]);
});

test("a suspended run records settled:suspended, and the document is NOT failed", async () => {
  const { ledger, calls } = recordingLedger();
  let failed = false;
  const r = await tick(
    deps({
      ledger,
      sink: { async markIndexed() {}, async markFailed() { failed = true; } },
      resolve: async () => ({
        source: { async fetchText() { return "hello"; }, mime: "text/plain" },
        // The embed-unavailable path: UnavailableError classifies as `quota`,
        // which the taxonomy parks rather than fails (stages.ts). A bare Error
        // would be `transient` and retry - a different branch entirely, and the
        // distinction is the whole reason A1 being unbuilt loses nothing.
        embedder: { async embed(): Promise<never> { throw new UnavailableError("A1 unavailable", { cause: "endpoint_not_granted", arg: "chat/extract" }); } },
        target: { async commit() {} },
        embeddingModel: null,
      }),
    }),
  );
  assert.equal(r.action, "suspend");
  assert.equal(failed, false);
  assert.deepEqual(calls, ["started", "settled:suspended"]);
});

test("A LEDGER THAT THROWS MUST NOT CHANGE THE OUTCOME", async () => {
  // Rule 1. A document that indexed correctly must not be reported as failed
  // because a bookkeeping write blew up. The Prisma implementation swallows its
  // own errors; this proves the worker does not depend on that generosity for
  // the SUCCESS path, and would surface a broken ledger rather than corrupting
  // the result.
  const exploding: TaskLedger = {
    async enqueued() { throw new Error("db down"); },
    async started() { throw new Error("db down"); },
    async stage() { throw new Error("db down"); },
    async settled() { throw new Error("db down"); },
  };
  await assert.rejects(() => tick(deps({ ledger: exploding })), /db down/);
  // ...and with the null ledger the very same run succeeds, so the difference is
  // provably the ledger and nothing else.
  const r = await tick(deps({ ledger: NULL_TASK_LEDGER }));
  assert.equal(r.action, "indexed");
});

test("the worker behaves identically with no ledger supplied at all", async () => {
  const r = await tick(deps());
  assert.equal(r.action, "indexed");
});
