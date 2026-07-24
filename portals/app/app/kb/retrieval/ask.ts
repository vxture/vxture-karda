// The answering surface (karda.ask, 120-retrieval-tools 6; product-definition
// 5.3): single-turn cited question answering. Unlike search and embed, its model
// dependency - Atlas A4 generation - is LIVE (KD-108), so this is built against
// the real ChatRequest contract, not a stub.
//
// ask reuses the search chain for retrieval, then generates one answer grounded
// in the retrieved chunks. No conversation, no orchestration - that is the
// agent's job (KD-004). The generation prompt cites the chunks so the answer is
// traceable, which is the whole point of "cited" answering.
import { runSearch, type SearchInput, type SearchResultItem } from "./search";

// --- the Atlas A4 generation port (ChatRequest, 40-model-platform.md) --------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  modelCode: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  tenantId: string;
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
  tenantId: string;
  userId?: string;
  modelCode: string;
  resolver: ChunkResolver;
  generation: GenerationClient;
  /** How many top results to ground the answer in. */
  contextK?: number;
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
    modelCode: input.modelCode,
    messages: prompt,
    temperature: 0,
    tenantId: input.tenantId,
    userId: input.userId,
    applicationType: "internal_service",
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
