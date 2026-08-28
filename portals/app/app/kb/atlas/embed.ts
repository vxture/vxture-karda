// The Atlas A1 embedding client (KD-107; KD-018). POST /v1/embed with
// { taskId, texts, workspaceId } plus the selection: a library-level modelCode
// pin when the KB carries one, otherwise the fixed embedding/default endpoint -
// Atlas resolves the concrete model from the tenant's GRANTS (KD-018:
// selection lives in authorization, not karda config). The response echoes the
// RESOLVED modelCode (verified live, atlas#37: "201 with
// modelCode=embedding-3"), and that echo is what callers record as the
// vector-space identity - the KD-107 lock now travels with the data, not with
// an env var.
//
// Error mapping is the load-bearing part: the processing taxonomy distinguishes
// suspend (parked, resumable - quota / capability gaps an operator fixes) from
// transient (bounded retries then failed). Atlas's `retryable` field plus the
// code decides which:
//   retryable:true  (RATE_LIMITED, PROVIDER_UNAVAILABLE, ...) -> transient
//   QUOTA_EXCEEDED                                            -> QuotaError (suspend)
//   NOT_ENTITLED / MODEL_NOT_* / ENDPOINT_NOT_ROUTABLE        -> UnavailableError (suspend)
//   validation 4xx (EMBED_TEXTS_INVALID, ...)                 -> plain Error (transient
//     -> bounded retries -> failed visibly; a karda-side payload bug must surface,
//     not park forever)
import { QuotaError, UnavailableError, type EmbeddingClient, type EmbedResult } from "../processing/orchestrator";
import { AtlasApiError, atlasPost, type AtlasClientCore, type AtlasContext } from "./client";
import { embedSelection, type ModelSelection } from "./selection";
import { shouldSuspend, causeForAtlasCode } from "./codes";

export const DEFAULT_ATLAS_EMBED_PATH = "/v1/embed";

/** Codes where waiting cannot help but an operator/capability change can: park
 *  the work (suspend) rather than burn retries or fail it. */

export function mapEmbedError(e: unknown, selection: ModelSelection): unknown {
  if (e instanceof AtlasApiError) {
    if (e.code === "QUOTA_EXCEEDED") return new QuotaError(`atlas embed: ${e.code}`);
    if (shouldSuspend(e.code, e.retryable)) {
      return new UnavailableError(`atlas embed: ${e.code}: ${e.message}`, causeForAtlasCode(e.code, selection));
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

/** The resolved model the response reports (atlas#37 verified shape). */
export function extractModelCode(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const code = (body as Record<string, unknown>).modelCode;
  return typeof code === "string" && code ? code : null;
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

  async embed(texts: string[], modelPin: string | null): Promise<EmbedResult> {
    const selection = embedSelection(modelPin);
    if (texts.length === 0) return { vectors: [], modelCode: selection.modelCode ?? "none" };
    let ctx: AtlasContext;
    try {
      ctx = await this.call.context();
    } catch (e) {
      // 换不到 aud=atlas 的令牌,几乎总是因为这个工作区还没在平台开通 karda
      // (`vx_provision.app_instance` 里查不到)。说成「模型能力未授权」会把人
      // 引去平台管理面反复看一个还不存在的产品实例。
      throw new UnavailableError(`embed context unresolvable: ${e instanceof Error ? e.message : String(e)}`, {
        cause: "workspace_not_provisioned",
        arg: null,
      });
    }
    let body: unknown;
    try {
      body = await atlasPost(this.core, this.embedPath, ctx, {
        taskId: this.call.taskId,
        texts,
        workspaceId: ctx.ws,
        ...selection,
      });
    } catch (e) {
      throw mapEmbedError(e, selection);
    }
    const vectors = extractVectors(body);
    if (!vectors || vectors.length !== texts.length) {
      throw new Error(`atlas embed: response vector count ${vectors?.length ?? "none"} != texts ${texts.length}`);
    }
    // The vector-space identity: prefer the response's resolved modelCode; a
    // pinned call may fall back to its own pin if the echo is absent. A
    // profile-routed call with NO echo cannot know its space - refuse rather
    // than store vectors under a guessed identity (KD-107).
    const modelCode = extractModelCode(body) ?? selection.modelCode ?? null;
    if (!modelCode) {
      throw new Error("atlas embed: response carries no modelCode - cannot identify the vector space");
    }
    return { vectors, modelCode };
  }
}
