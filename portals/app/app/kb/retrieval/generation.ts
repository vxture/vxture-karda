// The Atlas A4 generation client (KD-108). Atlas is now an INDEPENDENT product
// (repo vxture-atlas), deployed on worker-02:3100 (platform infra registry
// `13-infra-allocation-registry` §3, in production 2026-07-27) - a SEPARATE
// service from the C2/C3 platform API (worker-01:8080). So A4 has its OWN base
// (ATLAS_BASE_URL), NOT PLATFORM_API_URL, and its OWN auth: A4 routes verify an
// S2S token-exchange bearer (RS256/JWKS, product_210), NOT the C2/C3
// x-vxture-internal-auth header. Endpoint path is `/model-platform/chat`
// (`ModelRuntimeController`); the exact path + a valid model code are being
// confirmed direct with the atlas line (80-liaison/140).
//
// This implements the GenerationClient port ask.ts drives. It stays inactive
// (getGenerationClient -> null) until ATLAS_BASE_URL + a bearer token are set, so
// karda.ask is honestly not_implemented until Atlas is reachable. NOTE: the
// platform's token-exchange ISSUANCE endpoint is not built yet, so a real bearer
// cannot be minted until that lands - ATLAS_S2S_TOKEN is the interim seam.
import { assertInternalTarget } from "../../lib/internal-target";
import type { GenerationClient, ChatRequest, ChatResponse } from "./ask";

export interface AtlasClientConfig {
  baseUrl: string;
  chatPath: string;
  /** S2S bearer token (from token-exchange; ATLAS_S2S_TOKEN in the interim). */
  token: string;
}

type FetchLike = typeof fetch;

export const DEFAULT_ATLAS_CHAT_PATH = "/model-platform/chat";

export class AtlasA4Client implements GenerationClient {
  constructor(
    private cfg: AtlasClientConfig,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // Egress guard: cleartext http only to loopback/private/tailnet (worker-02
    // is on the tailnet, so 100.76.219.48:3100 passes; a public host must be https).
    const url = assertInternalTarget(`${this.cfg.baseUrl.replace(/\/$/, "")}${this.cfg.chatPath}`);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.token}` },
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
 * The generation client, or null when it cannot run yet. Activates only when the
 * Atlas base (ATLAS_BASE_URL, e.g. http://100.76.219.48:3100) and a bearer token
 * (ATLAS_S2S_TOKEN) are both set; null keeps karda.ask honestly not_implemented
 * rather than failing at call time. The chat path defaults to the known Atlas
 * route and is overridable via ATLAS_CHAT_PATH.
 */
export function getGenerationClient(): GenerationClient | null {
  const baseUrl = process.env.ATLAS_BASE_URL;
  const token = process.env.ATLAS_S2S_TOKEN;
  if (!baseUrl || !token) return null;
  const chatPath = process.env.ATLAS_CHAT_PATH || DEFAULT_ATLAS_CHAT_PATH;
  return new AtlasA4Client({ baseUrl, chatPath, token });
}

/** The model code ask uses, from ATLAS_ASK_MODEL (owner sets a valid code). */
export function askModelCode(): string {
  return process.env.ATLAS_ASK_MODEL ?? "default";
}
