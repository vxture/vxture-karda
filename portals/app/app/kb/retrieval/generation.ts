// The Atlas A4 generation client (KD-108: A4 is live in production, served by the
// platform's @vxture/service-model-platform - Atlas is not yet an independent
// product, so it is reached over the SAME internal tailnet base as C2/C3, with
// the x-vxture-internal-auth header). This implements the GenerationClient port
// ask.ts drives; wiring it moves karda.ask off not_implemented.
//
// The ChatRequest contract (modelCode / messages / tenantId / applicationType /
// usageType) is fixed in the platform's 40-model-platform.md; the endpoint PATH
// and the model code are not in karda's repo, so both are env-configurable
// (ATLAS_CHAT_PATH, ATLAS_ASK_MODEL) - the client is correct regardless of their
// values, and ask activates only once they are set.
import { assertInternalTarget } from "../../lib/internal-target";
import { getPlatformClientConfig } from "../../entitlement/platform-client";
import type { GenerationClient, ChatRequest, ChatResponse } from "./ask";

export interface AtlasClientConfig {
  baseUrl: string;
  authToken: string;
  chatPath: string;
}

type FetchLike = typeof fetch;

export class AtlasA4Client implements GenerationClient {
  constructor(
    private cfg: AtlasClientConfig,
    private fetchImpl: FetchLike = fetch,
  ) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    // The S2S egress guard: cleartext http only to loopback/private/tailnet.
    const url = assertInternalTarget(`${this.cfg.baseUrl.replace(/\/$/, "")}${this.cfg.chatPath}`);
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-vxture-internal-auth": this.cfg.authToken },
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
 * The generation client, or null when it cannot run (no platform base / token, or
 * no ATLAS_CHAT_PATH set). Null keeps karda.ask honestly not_implemented rather
 * than failing at call time.
 */
export function getGenerationClient(): GenerationClient | null {
  const cfg = getPlatformClientConfig();
  const chatPath = process.env.ATLAS_CHAT_PATH;
  if (!cfg || !chatPath) return null;
  return new AtlasA4Client({ baseUrl: cfg.baseUrl, authToken: cfg.authToken, chatPath });
}

/** The model code ask uses, from ATLAS_ASK_MODEL (owner sets a valid code). */
export function askModelCode(): string {
  return process.env.ATLAS_ASK_MODEL ?? "default";
}
