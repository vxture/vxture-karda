// The Atlas A1 embedding client (KD-107; TD-004 closure). POST /v1/embed with
// { taskId, texts, workspaceId, modelCode } - the modelCode IS the library's
// version-lock identifier (KD-107: no silent `latest` drift), so it is passed
// per call from the KB row (falling back to ATLAS_EMBED_MODEL), never resolved
// loosely here.
//
// Error mapping is the load-bearing part: the processing taxonomy distinguishes
// suspend (parked, resumable - quota / capability gaps an operator fixes) from
// transient (bounded retries then failed). Atlas's `retryable` field plus the
// code decides which:
//   retryable:true  (RATE_LIMITED, PROVIDER_UNAVAILABLE, ...) -> transient
//   QUOTA_EXCEEDED                                            -> QuotaError (suspend)
//   NOT_ENTITLED / MODEL_NOT_* / TASK_PROFILE_NOT_ROUTABLE    -> UnavailableError (suspend)
//   validation 4xx (EMBED_TEXTS_INVALID, ...)                 -> plain Error (transient
//     -> bounded retries -> failed visibly; a karda-side payload bug must surface,
//     not park forever)
import { QuotaError, UnavailableError, type EmbeddingClient } from "../processing/orchestrator";
import { AtlasApiError, atlasPost, type AtlasClientCore, type AtlasContext } from "./client";

export const DEFAULT_ATLAS_EMBED_PATH = "/v1/embed";

/** Codes where waiting cannot help but an operator/capability change can: park
 *  the work (suspend) rather than burn retries or fail it. */
const SUSPEND_CODES = new Set([
  "QUOTA_EXCEEDED",
  "NOT_ENTITLED",
  "MODEL_NOT_IMPLEMENTED",
  "MODEL_NOT_ROUTABLE",
  "ENDPOINT_NOT_ROUTABLE",
  "TASK_PROFILE_NOT_ROUTABLE",
]);

export function mapEmbedError(e: unknown): unknown {
  if (e instanceof AtlasApiError) {
    if (e.code === "QUOTA_EXCEEDED") return new QuotaError(`atlas embed: ${e.code}`);
    if (!e.retryable && SUSPEND_CODES.has(e.code)) {
      return new UnavailableError(`atlas embed: ${e.code}: ${e.message}`);
    }
    // retryable (RATE_LIMITED / PROVIDER_UNAVAILABLE / 5xx) and validation 4xx
    // both fall through as plain errors -> the taxonomy's bounded transient path.
    return new Error(`atlas embed: ${e.code}: ${e.message}`);
  }
  return e;
}

/** Tolerant vector extraction across the shapes an embed endpoint returns. */
export function extractVectors(body: unknown): number[][] | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  const direct = o.vectors ?? o.embeddings;
  if (isVectorArray(direct)) return direct;
  const data = o.data;
  if (Array.isArray(data)) {
    const out: number[][] = [];
    for (const row of data) {
      const v = row && typeof row === "object" ? (row as Record<string, unknown>).embedding : null;
      if (!isVector(v)) return null;
      out.push(v);
    }
    return out;
  }
  return null;
}

function isVector(v: unknown): v is number[] {
  return Array.isArray(v) && v.every((x) => typeof x === "number");
}

function isVectorArray(v: unknown): v is number[][] {
  return Array.isArray(v) && v.every(isVector);
}

export interface EmbedCallContext {
  /** Resolved lazily: background tasks look the tenant up per document's
   *  workspace (vx_provision.app_instance), request-path callers already have it. */
  context: () => Promise<AtlasContext>;
  taskId: string;
}

/**
 * The real A1 client behind the orchestrator's EmbeddingClient port. One batch
 * call per document's chunk set (KD-107 asked for a batch interface; Atlas
 * delivered /v1/embed with a texts array). Throws mapped errors - see above.
 */
export class AtlasEmbedClient implements EmbeddingClient {
  constructor(
    private core: AtlasClientCore,
    private call: EmbedCallContext,
    private embedPath: string = process.env.ATLAS_EMBED_PATH || DEFAULT_ATLAS_EMBED_PATH,
  ) {}

  async embed(texts: string[], modelVersion: string): Promise<number[][]> {
    if (!modelVersion || modelVersion === "unset") {
      // No model lock configured for this library: park, do not guess a model -
      // KD-107 makes the modelCode the version lock, and an accidental default
      // would silently mix vector spaces.
      throw new UnavailableError("no embedding model configured (KB embedding_model / ATLAS_EMBED_MODEL)");
    }
    if (texts.length === 0) return [];
    let ctx: AtlasContext;
    try {
      ctx = await this.call.context();
    } catch (e) {
      throw new UnavailableError(`embed context unresolvable: ${e instanceof Error ? e.message : String(e)}`);
    }
    let body: unknown;
    try {
      body = await atlasPost(this.core, this.embedPath, ctx, {
        taskId: this.call.taskId,
        texts,
        workspaceId: ctx.ws,
        modelCode: modelVersion,
      });
    } catch (e) {
      throw mapEmbedError(e);
    }
    const vectors = extractVectors(body);
    if (!vectors || vectors.length !== texts.length) {
      throw new Error(`atlas embed: response vector count ${vectors?.length ?? "none"} != texts ${texts.length}`);
    }
    return vectors;
  }
}
