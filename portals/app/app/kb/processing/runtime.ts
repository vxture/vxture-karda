// The processing runtime wiring (110-processing 2, 8; TD-007). The pipeline core
// (orchestrator / worker / queue) is pure logic behind ports; this module is the
// seam that binds those ports to the real content service, object storage, and
// the atomic-replace commit target, and exposes the three things a running
// system needs: a place to enqueue an uploaded document, a DocumentSink that
// moves the document's content state, and a per-task resolver the worker calls.
//
// It stays deliberately thin. Everything with a decision in it (scheduling, the
// failure taxonomy, state transitions) already lives in the pure modules; here we
// only assemble them, so the one impure piece - getProcessingRuntime() building
// the real Prisma / object-store ports - has nothing to test, and everything
// below it is covered with fakes.
import { ContentService } from "../lib/content-service";
import { getContentStore, type DocumentRow } from "../lib/content-store";
import { getObjectStore, type ObjectStore } from "../storage/objectstore";
import { TaskQueue, type Task } from "./queue";
import type { DocumentSink, WorkerDeps } from "./worker";
import {
  UnavailableEmbeddingClient,
  type RawSource,
  type EmbeddingClient,
  type CommitTarget,
} from "./orchestrator";
import { PrismaCommitTarget } from "./commit";
import { taskKey, configFingerprint, tierForTrigger } from "./stages";

// --- sink: content-state transitions ----------------------------------------

/**
 * DocumentSink over the real ContentService. markIndexed / markFailed are the two
 * terminal outcomes the worker applies; both are legal only from `processing`
 * (state.ts). A document deleted mid-flight (processing -> deleted, an owner act)
 * makes the transition `illegal_transition` or `not_found` - a benign race, not a
 * bug - so it is swallowed rather than thrown: the document already moved on and
 * the task is done either way. Any other error is a real fault and does throw.
 */
export class ContentSink implements DocumentSink {
  constructor(private content: ContentService) {}

  async markIndexed(docId: string): Promise<void> {
    await this.apply(docId, "indexed");
  }

  async markFailed(docId: string, reason: string): Promise<void> {
    await this.apply(docId, "failed", reason);
  }

  private async apply(docId: string, to: "indexed" | "failed", reason?: string): Promise<void> {
    const r = await this.content.transitionDocument(docId, to, reason);
    if (!r.ok && r.error.code !== "not_found" && r.error.code !== "illegal_transition") {
      throw new Error(`processing sink ${to}(${docId}): ${r.error.code}`);
    }
  }
}

// --- enqueue -----------------------------------------------------------------

/** The inputs to the config fingerprint - the things whose change forces a
 *  reprocess (stages.configFingerprint). */
export interface ProcessingConfig {
  processingTemplateId: string | null;
  processingParams: Record<string, unknown>;
  embeddingModel: string | null;
}

export interface EnqueueParams {
  docId: string;
  kbId: string;
  /** the KB's owning workspace - the org key for the concurrency cap. */
  workspaceId: string;
  contentHash: string | null;
  config: ProcessingConfig;
  trigger: Parameters<typeof tierForTrigger>[0];
  /** a manual re-run after a fix carries a new generation, so it is a NEW task,
   *  not a dedup'd no-op against the old key (stages section 8). */
  retryGeneration?: number;
}

/**
 * Enqueue one document for processing, deriving the idempotency key, tier, and
 * org key from the document + its KB config. Returns false if an identical task
 * is already queued (dedup by key), so enqueue-on-upload is safe to call
 * unconditionally.
 */
export function enqueueForDocument(queue: TaskQueue, p: EnqueueParams): boolean {
  const gen = p.retryGeneration ?? 0;
  const key = taskKey(p.docId, p.contentHash ?? "-", configFingerprint(p.config), gen);
  return queue.enqueue({
    key,
    docId: p.docId,
    kbId: p.kbId,
    org: p.workspaceId,
    tier: tierForTrigger(p.trigger),
    attempt: gen,
  });
}

// --- resolver ----------------------------------------------------------------

export interface ResolverDeps {
  content: ContentService;
  objects: ObjectStore;
  /** injectable for tests; prod uses the A1 stub (suspends) and the Prisma target. */
  embedder?: () => EmbeddingClient;
  commitTargetFor?: (docId: string) => CommitTarget;
}

/**
 * Build the per-task resolver the worker calls: fetch the document, and return
 * the raw source (text over object storage), the embedder, the commit target,
 * and the embedding model. Returns null when the document is gone, which the
 * worker treats as "drop the task, do not fail a document that no longer exists".
 */
export function makeResolver(deps: ResolverDeps): WorkerDeps["resolve"] {
  const embedder = deps.embedder ?? (() => new UnavailableEmbeddingClient());
  const commitTargetFor = deps.commitTargetFor ?? ((docId: string) => new PrismaCommitTarget(docId));

  return async (task: Task) => {
    const got = await deps.content.getDocument(task.docId);
    if (!got.ok) return null;
    const doc = got.value;

    // The KB row does not yet expose processing_params / embedding_model (only
    // processing_template_id), so embeddingModel resolves to null for now. That
    // is inert while Atlas A1 is unavailable - the embed stage suspends
    // regardless - and sourcing the real model is a small follow-up (TD-007)
    // once the KB row carries it.
    const embeddingModel: string | null = null;

    return {
      source: rawSourceFor(doc, deps.objects),
      embedder: embedder(),
      target: commitTargetFor(task.docId),
      embeddingModel,
    };
  };
}

/**
 * RawSource over object storage: read the stored bytes and decode as text (the
 * fast path). A missing storage ref or object throws, which the pipeline
 * classifies transient - a bounded retry, then residency - rather than losing the
 * document silently.
 */
export function rawSourceFor(doc: DocumentRow, objects: ObjectStore): RawSource {
  return {
    mime: doc.mime ?? "application/octet-stream",
    fetchText: async () => {
      if (!doc.storageRef) throw new Error(`document ${doc.id} has no stored object`);
      const bytes = await objects.get(doc.storageRef);
      if (!bytes) throw new Error(`stored object ${doc.storageRef} is missing`);
      return bytes.toString("utf-8");
    },
  };
}

// --- production singleton ----------------------------------------------------

let runtime: WorkerDeps | null = null;

/**
 * The process-wide processing runtime: one queue, the real content sink, and a
 * resolver over the real content store + object storage. A singleton so the queue
 * is shared across requests - an upload enqueues, the tick endpoint drains the
 * same queue. This is the one place the pure core meets real ports, so it is
 * impure by nature and not unit-tested; the pieces it assembles are.
 */
export function getProcessingRuntime(): WorkerDeps {
  if (runtime) return runtime;
  const content = new ContentService(getContentStore());
  runtime = {
    queue: new TaskQueue(),
    sink: new ContentSink(content),
    resolve: makeResolver({ content, objects: getObjectStore() }),
    now: () => Date.now(),
  };
  return runtime;
}

/** Test-only: drop the singleton so the next getProcessingRuntime() rebuilds it. */
export function resetProcessingRuntime(): void {
  runtime = null;
}
