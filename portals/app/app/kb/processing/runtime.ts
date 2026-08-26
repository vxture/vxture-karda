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
import { decodeSourceBytes } from "./ir";
import { ContentService } from "../lib/content-service";
import { getContentStore, type DocumentRow } from "../lib/content-store";
import { getObjectStore, type ObjectStore } from "../storage/objectstore";
import { TaskQueue, type Task } from "./queue";
import type { DocumentSink, WorkerDeps } from "./worker";
import type { RawSource, EmbeddingClient, CommitTarget } from "./orchestrator";
import { PrismaCommitTarget } from "./commit";
import { taskKey, configFingerprint, tierForTrigger } from "./stages";
import { processingEmbedder, type EmbedderTaskContext } from "./atlas-embedder";
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import { getTaskLedger, type TaskLedger } from "./task-ledger";

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
  /** Row-level provenance for the ledger, same pair the document carries
   *  (#108). Optional: a rebuild sweep has no user, and inventing one would be
   *  worse than recording none. */
  createdInProduct?: string | null;
  createdBy?: string | null;
}

/**
 * Enqueue one document for processing, deriving the idempotency key, tier, and
 * org key from the document + its KB config. Returns false if an identical task
 * is already queued (dedup by key), so enqueue-on-upload is safe to call
 * unconditionally.
 */
export function enqueueForDocument(queue: TaskQueue, p: EnqueueParams, ledger: TaskLedger = getTaskLedger()): boolean {
  const gen = p.retryGeneration ?? 0;
  const key = taskKey(p.docId, p.contentHash ?? "-", configFingerprint(p.config), gen);
  const tier = tierForTrigger(p.trigger);
  const accepted = queue.enqueue({
    key,
    docId: p.docId,
    kbId: p.kbId,
    org: p.workspaceId,
    tier,
    attempt: gen,
  });
  // Only a NEWLY accepted task gets a row: a dedup'd enqueue is the same work,
  // and writing a second row for it would double every queue-depth figure on the
  // 加工管道 page. Deliberately not awaited - enqueue is synchronous by contract
  // (callers rely on the boolean) and the ledger can never fail a task, so the
  // write is fire-and-forget with its own error swallowing inside.
  if (accepted) {
    void ledger.enqueued({
      docId: p.docId,
      kbId: p.kbId,
      tier,
      attempt: gen,
      createdInProduct: p.createdInProduct ?? null,
      createdBy: p.createdBy ?? null,
    });
  }
  return accepted;
}

// --- resolver ----------------------------------------------------------------

export interface ResolverDeps {
  content: ContentService;
  objects: ObjectStore;
  /** injectable for tests; prod binds the real A1 client per task when Atlas is
   *  configured (atlas-embedder.ts), else the suspend-stub. */
  embedder?: (ctx: EmbedderTaskContext) => EmbeddingClient;
  commitTargetFor?: (docId: string) => CommitTarget;
  /** the library's OPTIONAL embedding-model pin (KD-107 lock); null = route by
   *  grant (KD-018, the normal state). */
  kbEmbeddingModel?: (kbId: string) => Promise<string | null>;
}

/** KB.embedding_model - the optional per-library pin. Null (the default) means
 *  the embed client routes by grant (embedding/default endpoint) and the RESOLVED
 *  model is recorded at commit; a pinned library never drifts vector space. */
async function kbEmbeddingModelDefault(kbId: string): Promise<string | null> {
  if (!prismaEnabled()) return null;
  const p = await getPrismaClient();
  const row: { embeddingModel: string | null } | null = await p.knowledgeBase.findUnique({
    where: { id: kbId },
    select: { embeddingModel: true },
  });
  return row?.embeddingModel ?? null;
}

/**
 * Build the per-task resolver the worker calls: fetch the document, and return
 * the raw source (text over object storage), the embedder, the commit target,
 * and the embedding model. Returns null when the document is gone, which the
 * worker treats as "drop the task, do not fail a document that no longer exists".
 */
export function makeResolver(deps: ResolverDeps): WorkerDeps["resolve"] {
  const embedder = deps.embedder ?? processingEmbedder;
  const commitTargetFor = deps.commitTargetFor ?? ((docId: string) => new PrismaCommitTarget(docId));
  const kbEmbeddingModel = deps.kbEmbeddingModel ?? kbEmbeddingModelDefault;

  return async (task: Task) => {
    const got = await deps.content.getDocument(task.docId);
    if (!got.ok) return null;
    const doc = got.value;

    // The library's optional pin (KD-107). Null = grant-routed (KD-018): the
    // embed client sends karda.embed and the commit records whichever model
    // the grant resolved. No grant -> ENDPOINT_NOT_ROUTABLE -> park.
    const embeddingModel = await kbEmbeddingModel(task.kbId);

    return {
      source: rawSourceFor(doc, deps.objects),
      embedder: embedder({ docId: task.docId, workspaceId: task.org }),
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
      return decodeSourceBytes(bytes);
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
    ledger: getTaskLedger(),
    now: () => Date.now(),
  };
  return runtime;
}

/** Test-only: drop the singleton so the next getProcessingRuntime() rebuilds it. */
export function resetProcessingRuntime(): void {
  runtime = null;
}

// --- parked-fleet recovery ---------------------------------------------------

/**
 * Re-enqueue every document sitting in `processing` (the parked-at-embed fleet,
 * TD-004; also any task lost to a restart - the queue is in-memory). Enqueue
 * dedups by task key, so re-running this against already-queued documents is a
 * no-op; combined with queue.resumeSuspended it is the "A1 is configured now,
 * turn the flywheel" lever the tick endpoint exposes.
 */
export async function reenqueueProcessing(queue: TaskQueue): Promise<number> {
  if (!prismaEnabled()) return 0;
  const p = await getPrismaClient();
  const docs: {
    id: string;
    kbId: string;
    contentHash: string | null;
    processingTemplateId: string | null;
    knowledgeBase: { workspaceId: string; processingTemplateId: string | null } | null;
  }[] = await p.document.findMany({
    where: { contentState: "processing" },
    select: {
      id: true,
      kbId: true,
      contentHash: true,
      processingTemplateId: true,
      knowledgeBase: { select: { workspaceId: true, processingTemplateId: true } },
    },
  });
  let enqueued = 0;
  for (const d of docs) {
    if (!d.knowledgeBase) continue;
    const ok = enqueueForDocument(queue, {
      docId: d.id,
      kbId: d.kbId,
      workspaceId: d.knowledgeBase.workspaceId,
      contentHash: d.contentHash,
      config: {
        processingTemplateId: d.processingTemplateId ?? d.knowledgeBase.processingTemplateId,
        processingParams: {},
        embeddingModel: null,
      },
      trigger: "rebuild",
    });
    if (ok) enqueued += 1;
  }
  return enqueued;
}
