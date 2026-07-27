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
// Endpoint path is `/model-platform/chat` (`ModelRuntimeController`); the exact
// path + a valid model code are being confirmed direct with the atlas line
// (80-liaison/140). Client stays inactive (getGenerationClient -> null) until
// ATLAS_BASE_URL is set, so karda.ask is honestly not_implemented until Atlas is
// reachable.
import { assertInternalTarget } from "../../lib/internal-target";
import type { GenerationClient, ChatRequest, ChatResponse } from "./ask";
import { getAtlasTokenSource, type AtlasTokenSource } from "./atlas-token";

export interface AtlasClientConfig {
  baseUrl: string;
  chatPath: string;
  /** Mints the aud=atlas bearer per (org, ws); see atlas-token.ts. */
  tokenSource: AtlasTokenSource;
}

type FetchLike = typeof fetch;

export const DEFAULT_ATLAS_CHAT_PATH = "/model-platform/chat";

export class AtlasA4Client implements GenerationClient {
  constructor(
    private cfg: AtlasClientConfig,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // Mint (or reuse a cached) aud=atlas bearer for this call's org/ws.
    const token = await this.cfg.tokenSource.tokenFor({ org: req.tenantId, ws: req.workspaceId ?? "" });
    // Egress guard: cleartext http only to loopback/private/tailnet (worker-02 is
    // on the tailnet, so 100.76.219.48:3100 passes; a public host must be https).
    const url = assertInternalTarget(`${this.cfg.baseUrl.replace(/\/$/, "")}${this.cfg.chatPath}`);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify(req),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`atlas chat endpoint ${res.status}`);
    const body: unknown = await res.json().catch(() => null);
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

export interface AskModelSelection {
  modelCode?: string;
  taskProfile?: string;
}

/**
 * How karda.ask picks a model on Atlas (KD-109; Atlas #70 §6). Two modes, and
 * exactly one field is emitted so there is no modelCode-vs-taskProfile precedence
 * ambiguity (Atlas requires at least one, and the two are alternatives):
 * - auto-adapt: if ATLAS_ASK_TASK_PROFILE is set, send that taskProfile label and
 *   let Atlas resolve a concrete model from the tenant's grant (no pinned code).
 *   This is the default posture for karda.ask, an S2S tool with no user model pick.
 * - pinned: otherwise send ATLAS_ASK_MODEL as an explicit modelCode.
 */
export function askModelSelection(): AskModelSelection {
  const taskProfile = process.env.ATLAS_ASK_TASK_PROFILE;
  if (taskProfile) return { taskProfile };
  return { modelCode: process.env.ATLAS_ASK_MODEL ?? "default" };
}
