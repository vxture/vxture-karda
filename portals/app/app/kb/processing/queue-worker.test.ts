import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskQueue } from "./queue";
import { tick, drain, type WorkerDeps, type DocumentSink } from "./worker";
import {
  UnavailableEmbeddingClient,
  QuotaError,
  type EmbeddingClient,
  type RawSource,
  type CommitTarget,
} from "./orchestrator";
import type { Task } from "./queue";

// --- queue scheduling --------------------------------------------------------

test("enqueue dedups by idempotency key", () => {
  const q = new TaskQueue();
  assert.ok(q.enqueue({ key: "k1", docId: "d1", kbId: "kb1", org: "o1", tier: "interactive" }));
  assert.ok(!q.enqueue({ key: "k1", docId: "d1", kbId: "kb1", org: "o1", tier: "interactive" }));
  assert.equal(q.depth, 1);
});

test("claim prefers interactive over sync over bulk", () => {
  const q = new TaskQueue();
  q.enqueue({ key: "b", docId: "d", kbId: "kbB", org: "o", tier: "bulk" });
  q.enqueue({ key: "i", docId: "d", kbId: "kbI", org: "o", tier: "interactive" });
  q.enqueue({ key: "s", docId: "d", kbId: "kbS", org: "o", tier: "sync" });
  assert.equal(q.claim(0)?.tier, "interactive");
});

test("the per-KB serial window prevents two tasks of one KB running at once", () => {
  const q = new TaskQueue();
  q.enqueue({ key: "a", docId: "d1", kbId: "kb1", org: "o", tier: "interactive" });
  q.enqueue({ key: "b", docId: "d2", kbId: "kb1", org: "o", tier: "interactive" });
  const first = q.claim(0);
  assert.ok(first);
  assert.equal(q.claim(0), null, "same KB is serialised");
  q.complete(first!);
  assert.ok(q.claim(0), "freed once the first completes");
});

test("the org concurrency cap bounds in-flight tasks per org", () => {
  const q = new TaskQueue(2, 8); // org cap 2
  for (let i = 0; i < 4; i++) q.enqueue({ key: `k${i}`, docId: `d${i}`, kbId: `kb${i}`, org: "o", tier: "bulk" });
  assert.ok(q.claim(0));
  assert.ok(q.claim(0));
  assert.equal(q.claim(0), null, "org cap reached at 2");
});

test("a task with runAfter in the future is not claimable yet", () => {
  const q = new TaskQueue();
  q.enqueue({ key: "k", docId: "d", kbId: "kb", org: "o", tier: "interactive", runAfter: 1000 });
  assert.equal(q.claim(0), null);
  assert.ok(q.claim(1000));
});

test("resumeSuspended makes parked tasks runnable again", () => {
  const q = new TaskQueue();
  q.enqueue({ key: "k", docId: "d", kbId: "kb", org: "o", tier: "interactive" });
  const t = q.claim(0)!;
  q.suspend(t);
  assert.equal(q.claim(1), null, "suspended is not claimable");
  assert.equal(q.resumeSuspended(2), 1);
  assert.ok(q.claim(2), "resumed and claimable");
});

// --- worker: outcome -> queue + document state -------------------------------

const textSource = (text: string, mime = "text/markdown"): RawSource => ({ mime, fetchText: async () => text });
const fakeEmbedder = (): EmbeddingClient => ({ async embed(texts) { return texts.map(() => [0.1]); } });
class NullTarget implements CommitTarget { async commit() {} }

class RecordingSink implements DocumentSink {
  indexed: string[] = [];
  failed: { id: string; reason: string }[] = [];
  async markIndexed(id: string) { this.indexed.push(id); }
  async markFailed(id: string, reason: string) { this.failed.push({ id, reason }); }
}

function deps(queue: TaskQueue, sink: RecordingSink, over: Partial<WorkerDeps> = {}): WorkerDeps {
  return {
    queue,
    sink,
    now: () => 0,
    async resolve() {
      return { source: textSource("# H\n\nbody"), embedder: fakeEmbedder(), target: new NullTarget(), embeddingModel: "m1" };
    },
    ...over,
  };
}

test("a healthy task indexes the document and leaves the queue", async () => {
  const q = new TaskQueue();
  const sink = new RecordingSink();
  q.enqueue({ key: "k", docId: "d1", kbId: "kb", org: "o", tier: "interactive" });
  const r = await tick(deps(q, sink));
  assert.deepEqual(r, { ran: true, action: "indexed", docId: "d1" });
  assert.deepEqual(sink.indexed, ["d1"]);
  assert.equal(q.depth, 0);
});

test("no embedder suspends: document stays processing, task parks, not failed", async () => {
  const q = new TaskQueue();
  const sink = new RecordingSink();
  q.enqueue({ key: "k", docId: "d1", kbId: "kb", org: "o", tier: "interactive" });
  const r = await tick(
    deps(q, sink, {
      async resolve() {
        return { source: textSource("# H\n\nb"), embedder: new UnavailableEmbeddingClient(), target: new NullTarget(), embeddingModel: null };
      },
    }),
  );
  assert.equal(r.action, "suspend");
  assert.deepEqual(sink.indexed, []);
  assert.deepEqual(sink.failed, [], "suspend never fails the document");
  assert.equal(q.suspendedCount(), 1);
});

test("a deep-path (permanent) failure marks the document failed with a reason", async () => {
  const q = new TaskQueue();
  const sink = new RecordingSink();
  q.enqueue({ key: "k", docId: "d1", kbId: "kb", org: "o", tier: "interactive" });
  const r = await tick(
    deps(q, sink, {
      async resolve() {
        return { source: textSource("scan", "application/pdf"), embedder: fakeEmbedder(), target: new NullTarget(), embeddingModel: "m1" };
      },
    }),
  );
  assert.equal(r.action, "failed");
  assert.equal(sink.failed.length, 1);
  assert.match(sink.failed[0].reason, /parse:/);
});

test("a transient failure reschedules the task with backoff, does not fail the doc", async () => {
  const q = new TaskQueue();
  const sink = new RecordingSink();
  q.enqueue({ key: "k", docId: "d1", kbId: "kb", org: "o", tier: "interactive", attempt: 0 });
  const throttling: EmbeddingClient = { async embed() { throw new Error("429"); } };
  const r = await tick(
    deps(q, sink, {
      async resolve() {
        return { source: textSource("# H\n\nb"), embedder: throttling, target: new NullTarget(), embeddingModel: "m1" };
      },
    }),
  );
  assert.equal(r.action, "retry");
  assert.deepEqual(sink.failed, []);
  assert.equal(q.depth, 1, "task stays queued for the retry");
});

test("a task whose document vanished is dropped, not failed", async () => {
  const q = new TaskQueue();
  const sink = new RecordingSink();
  q.enqueue({ key: "k", docId: "gone", kbId: "kb", org: "o", tier: "interactive" });
  const r = await tick(deps(q, sink, { async resolve() { return null; } }));
  assert.equal(r.ran, true);
  assert.deepEqual(sink.failed, [], "a deleted document is not marked failed");
  assert.equal(q.depth, 0);
});

test("drain processes every runnable task, then stops on parked ones", async () => {
  const q = new TaskQueue(8, 8);
  const sink = new RecordingSink();
  for (let i = 0; i < 5; i++) q.enqueue({ key: `k${i}`, docId: `d${i}`, kbId: `kb${i}`, org: "o", tier: "interactive" });
  // one will suspend (its resolve returns the unavailable embedder)
  const ran = await drain(
    deps(q, sink, {
      async resolve(task: Task) {
        const embedder = task.docId === "d3" ? new UnavailableEmbeddingClient() : fakeEmbedder();
        return { source: textSource("# H\n\nb"), embedder, target: new NullTarget(), embeddingModel: "m1" };
      },
    }),
  );
  assert.equal(ran, 5, "all five were attempted");
  assert.equal(sink.indexed.length, 4, "four indexed");
  assert.equal(q.suspendedCount(), 1, "one parked");
});
