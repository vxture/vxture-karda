// The answering surface (karda.ask, 120-retrieval-tools 6; product-definition
// 5.3): single-turn cited question answering. Unlike search and embed, its model
// dependency - Atlas A4 generation - is LIVE (KD-108), so this is built against
// the real ChatRequest contract, not a stub.
//
// ask reuses the search chain for retrieval, then generates one answer grounded
// in the retrieved chunks. No conversation, no orchestration - that is the
// agent's job (KD-004). The generation prompt cites the chunks so the answer is
// traceable, which is the whole point of "cited" answering.
import { runSearch, DEFAULT_SEARCH_PARAMS, type SearchInput, type SearchResultItem } from "./search";
import type { VerificationFilter } from "../lib/state";

// --- the Atlas A4 generation port (ChatRequest, 40-model-platform.md) --------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  /** REQUIRED on every /v1 entry since Atlas v0.15.0 (product_251 X-2;
   *  karda#101): the cross-product work-unit key. Any stable string <=128
   *  chars, stored verbatim; the SAME agent task must send the SAME value
   *  across products and models - it is the only key that adds a task's
   *  consumption back together. */
  taskId: string;
  // The selector. Atlas's contract accepts one of three
  // (`modelCode` > `endpointCode` > `taskProfile`, narrower wins), but this type
  // describes what KARDA SENDS, not everything Atlas tolerates: `taskProfile` is
  // the legacy tenant axis and is deliberately not declared, so no call site can
  // reach for it by accident.
  modelCode?: string;
  endpointCode?: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tenantId: string;
  /** The org's active workspace - the S2S token-exchange service context. */
  workspaceId?: string;
  // Optional attribution. Atlas couples them: applicationType requires an
  // applicationId, and applicationId must be a UUID from the token context (a
  // tenant/workspace id), not a product string (verified live 2026-07-27). karda.ask
  // sends neither - the tenant/workspace/user context is already carried by the
  // token + the fields above - to keep the request minimal-valid.
  applicationId?: string;
  applicationType?: "agent" | "workflow" | "api_client" | "internal_service";
  userId?: string;
  usageType?: "normal" | "retry" | "test";
}

export interface ChatResponse {
  content: string;
}

export interface GenerationClient {
  chat(req: ChatRequest): Promise<ChatResponse>;
}

// --- resolving the recalled ids to their text -------------------------------

export interface ChunkText {
  id: string;
  kbId: string;
  content: string;
}

export interface ChunkResolver {
  /** Fetch the text for recalled ids, for grounding + citation. */
  resolve(ids: string[]): Promise<ChunkText[]>;
}

// --- ask --------------------------------------------------------------------

export interface AskInput extends Omit<SearchInput, "params"> {
  /** The work-unit id threaded to Atlas (see ChatRequest.taskId). */
  taskId: string;
  tenantId: string;
  workspaceId?: string;
  userId?: string;
  modelCode?: string;
  endpointCode?: string;
  resolver: ChunkResolver;
  generation: GenerationClient;
  /** How many top results to ground the answer in. */
  contextK?: number;
  /**
   * The quality tier to ground on.
   *
   * A narrow field rather than the whole `params` bag, because ask genuinely
   * does not let a caller set poolCap/perNamespaceN, and topK is expressed as
   * `contextK`. But the verification filter it MUST honour: `karda.ask`
   * publishes `verification_filter` in its input list, so an agent asking for
   * `verified_only` and getting untracked content in its citations is a broken
   * contract in a cited-answer product - the caller excluded that content and
   * we cited it anyway.
   */
  verificationFilter?: VerificationFilter;
}

export interface Citation {
  id: string;
  kbId: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
  degraded: null | "rerank_unavailable";
  partial: boolean;
  /** True when retrieval found nothing - the answer says so, no generation. */
  noContext: boolean;
}

export async function runAsk(input: AskInput): Promise<AskResult> {
  const search = await runSearch({
    query: input.query,
    scope: input.scope,
    recallers: input.recallers,
    reranker: input.reranker,
    // Was omitted entirely, so every ask silently fell back to
    // DEFAULT_SEARCH_PARAMS - `verified_only` leaked untracked content into the
    // grounding, and `all` was quietly narrowed.
    params: input.verificationFilter
      ? { ...DEFAULT_SEARCH_PARAMS, verificationFilter: input.verificationFilter }
      : undefined,
  });

  const contextK = input.contextK ?? 5;
  const top = search.items.slice(0, contextK);

  if (top.length === 0) {
    // No grounding: do NOT generate an ungrounded answer - cited answering that
    // invents an answer with no source is the failure mode this surface exists
    // to avoid. Return a no-context result the caller renders honestly.
    return {
      answer: "",
      citations: [],
      degraded: search.degraded,
      partial: search.partial,
      noContext: true,
    };
  }

  const texts = await input.resolver.resolve(top.map((t) => t.id));
  const byId = new Map(texts.map((t) => [t.id, t]));
  const grounded = top
    .map((t) => byId.get(t.id))
    .filter((t): t is ChunkText => t !== undefined);

  const prompt = buildPrompt(input.query, grounded);
  const res = await input.generation.chat({
    taskId: input.taskId,
    modelCode: input.modelCode,
    endpointCode: input.endpointCode,
    messages: prompt,
    temperature: 0,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    usageType: "normal",
  });

  return {
    answer: res.content,
    citations: grounded.map((g) => ({ id: g.id, kbId: g.kbId })),
    degraded: search.degraded,
    partial: search.partial,
    noContext: false,
  };
}

/**
 * Build the grounding prompt. The context chunks are numbered so the model can
 * cite them, and the system message forbids answering beyond the provided
 * context - the guard against a confident ungrounded answer.
 */
export function buildPrompt(query: string, context: ChunkText[]): ChatMessage[] {
  const numbered = context.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
  return [
    {
      role: "system",
      content:
        "Answer the question using ONLY the numbered context passages. " +
        "Cite the passages you use as [n]. If the context does not contain the " +
        "answer, say you do not have enough information - do not use outside knowledge.",
    },
    { role: "user", content: `Context:\n${numbered}\n\nQuestion: ${query}` },
  ];
}

export type { SearchResultItem };
