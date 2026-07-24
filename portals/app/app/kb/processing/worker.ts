// The task worker (110-processing 2, 8): claim a task, run the pipeline, and map
// the result onto both the queue (retry / suspend / done / fail) and the
// document's content state. This is the piece that turns an uploaded document in
// `processing` into `indexed` or `failed` - or leaves it parked when embedding
// is unavailable.
//
// The worker owns no policy: the failure taxonomy (stages.ts) already decided
// retry-vs-suspend-vs-fail, and the state machine (state.ts) already knows the
// legal transitions. The worker just applies both, in the one place they meet.
import { runPipeline, type EmbeddingClient, type CommitTarget, type RawSource } from "./orchestrator";
import { backoffMs } from "./stages";
import { TaskQueue, type Task } from "./queue";
import { DEFAULT_CHUNK_PARAMS } from "./chunk";

// The document operations the worker needs. A thin slice of ContentService so
// the worker is testable with a fake, and so it cannot reach beyond what it
// should touch.
export interface DocumentSink {
  /** processing -> indexed on success. */
  markIndexed(docId: string): Promise<void>;
  /** processing -> failed, with the reason (permanent or retries exhausted). */
  markFailed(docId: string, reason: string): Promise<void>;
  // A suspended task leaves the document in `processing` (the queue holds the
  // parked task); there is no `suspended` content state, per 110-processing 8.
}

export interface WorkerDeps {
  queue: TaskQueue;
  sink: DocumentSink;
  /** Resolve a document's raw source + config for the run. */
  resolve(task: Task): Promise<{
    source: RawSource;
    embedder: EmbeddingClient;
    target: CommitTarget;
    embeddingModel: string | null;
  } | null>;
  now(): number;
}

export interface TickResult {
  ran: boolean;
  action?: "indexed" | "failed" | "retry" | "suspend";
  docId?: string;
}

/**
 * Process one claimable task, if any. Returns whether it ran and what happened -
 * a caller loops tick() (or runs it on a schedule) to drain the queue. Kept as a
 * single step so scheduling and concurrency stay the queue's job, not a hidden
 * loop's.
 */
export async function tick(deps: WorkerDeps): Promise<TickResult> {
  const now = deps.now();
  const task = deps.queue.claim(now);
  if (!task) return { ran: false };

  const resolved = await deps.resolve(task);
  if (!resolved) {
    // The document went away (deleted mid-flight): drop the task, do not fail a
    // document that no longer exists.
    deps.queue.complete(task);
    return { ran: true, action: "failed", docId: task.docId };
  }

  const result = await runPipeline({
    source: resolved.source,
    embedder: resolved.embedder,
    target: resolved.target,
    embeddingModel: resolved.embeddingModel,
    chunkParams: DEFAULT_CHUNK_PARAMS,
    attempt: task.attempt,
  });

  if ("done" in result) {
    await deps.sink.markIndexed(task.docId);
    deps.queue.complete(task);
    return { ran: true, action: "indexed", docId: task.docId };
  }

  // failed - the taxonomy already chose the outcome.
  switch (result.outcome.action) {
    case "retry":
      deps.queue.retry(task, result.outcome.nextGeneration, now + backoffMs(task.attempt));
      return { ran: true, action: "retry", docId: task.docId };
    case "suspend":
      // Parked: the document stays `processing`, the task waits for resume. This
      // is the embed-unavailable path (A1) as much as quota - nothing is lost.
      deps.queue.suspend(task);
      return { ran: true, action: "suspend", docId: task.docId };
    case "fail":
      await deps.sink.markFailed(task.docId, `${result.stage}: ${result.reason}`);
      deps.queue.fail(task);
      return { ran: true, action: "failed", docId: task.docId };
  }
}

/** Drain until nothing is claimable (bounded so a stuck task cannot spin). */
export async function drain(deps: WorkerDeps, maxSteps = 1000): Promise<number> {
  let ran = 0;
  for (let i = 0; i < maxSteps; i++) {
    const r = await tick(deps);
    if (!r.ran) break;
    ran += 1;
    // A claimed task is released synchronously by tick's outcome handlers, but a
    // suspended/retry-backoff task is not immediately re-runnable, so the loop
    // naturally stops when only parked/backed-off tasks remain.
  }
  return ran;
}
