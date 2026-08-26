// The Atlas A4 generation client (KD-108). Atlas is an INDEPENDENT product (repo
// vxture-atlas), deployed on worker-02:3100 (platform infra registry §3, in
// production 2026-07-27) - a SEPARATE service from the C2/C3 platform API
// (worker-01:8080). So A4 has its OWN base (ATLAS_BASE_URL, NOT PLATFORM_API_URL)
// and its OWN auth: an S2S token-exchange bearer (aud=atlas, RS256/JWKS,
// product_210 §3), NOT the C2/C3 x-vxture-internal-auth header. The bearer is
// minted dynamically per (org, ws) by the token-exchange caller (atlas-token.ts),
// so there is no static token to provision - karda mints one from its own OIDC
// client creds against the platform IdP.
//
// Endpoint path is `/v1/chat` - Atlas's canonical data-plane (its authoritative
// `20-specs/10-http-surface.md`). The old `/model-platform/*` aliases were REMOVED
// 2026-07-28 (they now 404, verified live 2026-07-29) - `/v1/*` is the only path.
// Overridable via ATLAS_CHAT_PATH. Client stays inactive (getGenerationClient ->
// null) until ATLAS_BASE_URL is set, so karda.ask is honestly not_implemented
// until Atlas is reachable.
import type { GenerationClient, ChatRequest, ChatResponse } from "./ask";
import { getAtlasTokenSource, type AtlasTokenSource } from "./atlas-token";
import { atlasPost } from "../atlas/client";

export interface AtlasClientConfig {
  baseUrl: string;
  chatPath: string;
  /** Mints the aud=atlas bearer per (org, ws); see atlas-token.ts. */
  tokenSource: AtlasTokenSource;
}

type FetchLike = typeof fetch;

export const DEFAULT_ATLAS_CHAT_PATH = "/v1/chat";

export class AtlasA4Client implements GenerationClient {
  constructor(
    private cfg: AtlasClientConfig,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // The shared /v1 core mints the bearer for this call's org/ws, applies the
    // egress guard, and turns a non-2xx into a typed AtlasApiError carrying the
    // envelope's { code, retryable } (never QUOTA_EXHAUSTED - that code was
    // promised but never thrown; the real one is QUOTA_EXCEEDED, karda#100).
    const body = await atlasPost(
      { baseUrl: this.cfg.baseUrl, tokenSource: this.cfg.tokenSource, fetchImpl: this.fetchImpl },
      this.cfg.chatPath,
      { org: req.tenantId, ws: req.workspaceId ?? "" },
      req as unknown as Record<string, unknown>,
    );
    const content = extractContent(body);
    if (content === null) throw new Error("atlas chat: no content in response");
    return { content };
  }
}

/** Tolerant content extraction across the shapes a chat endpoint might return. */
export function extractContent(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (typeof o.content === "string") return o.content;
  if (typeof o.answer === "string") return o.answer;
  const msg = o.message as Record<string, unknown> | undefined;
  if (msg && typeof msg.content === "string") return msg.content;
  const choices = o.choices as { message?: { content?: unknown } }[] | undefined;
  if (Array.isArray(choices) && typeof choices[0]?.message?.content === "string") {
    return choices[0].message!.content as string;
  }
  return null;
}

/**
 * The generation client, or null when it cannot run yet. Activates only when
 * ATLAS_BASE_URL is set (e.g. http://100.76.219.48:3100) AND karda has OIDC client
 * creds to mint the bearer (getAtlasTokenSource); null keeps karda.ask honestly
 * not_implemented rather than failing at call time. The chat path defaults to the
 * known Atlas route and is overridable via ATLAS_CHAT_PATH.
 */
export function getGenerationClient(): GenerationClient | null {
  const baseUrl = process.env.ATLAS_BASE_URL;
  const tokenSource = getAtlasTokenSource();
  if (!baseUrl || !tokenSource) return null;
  const chatPath = process.env.ATLAS_CHAT_PATH || DEFAULT_ATLAS_CHAT_PATH;
  return new AtlasA4Client({ baseUrl, chatPath, tokenSource });
}

/**
 * How karda.ask picks a model on Atlas: grant-driven (KD-018, superseding the
 * KD-109 env-pin default). The fixed `chat/default` endpoint routes via the
 * tenant's grants; ATLAS_ASK_TASK_PROFILE / ATLAS_ASK_MODEL remain break-glass
 * overrides. Exactly one field is emitted (Atlas requires one selector; they
 * are alternatives).
 */
export { askSelection as askModelSelection } from "../atlas/selection";
export type { ModelSelection as AskModelSelection } from "../atlas/selection";
