// karda.ask wiring (TD-008): compose the same scope + BM25 recall as search, then
// ground a single-turn cited answer over Atlas A4 (runAsk). It reuses the search
// chain for retrieval, so the whitelist floor and the degrade contract are
// identical; the only additions are resolving recalled ids to text and calling
// the A4 generation client. Injected only when a generation client exists, so ask
// is honestly not_implemented until Atlas A4 is configured.
import { randomUUID } from "node:crypto";
import { runAsk, type GenerationClient, type ChunkResolver, type ChunkText } from "./ask";
import { UnavailableReranker } from "./search";
import { resolveScope } from "./scope";
import { Bm25Recaller } from "./bm25-recaller";
import type { RecallCorpus, RecallTextResolver } from "./corpus";
import type { VisibleSetResolver } from "./visible-set";
import type { AttachmentStore } from "../attachments/store";
import { recordUsage } from "../../usage/lib/buffer";
import type { CallerContext } from "../tools/s2s";

export interface AskToolDeps {
  visibleSet: VisibleSetResolver;
  attachments: AttachmentStore;
  corpus: RecallCorpus;
  textResolver: RecallTextResolver;
  generation: GenerationClient;
  model: string;
}

export interface AskToolResult {
  answer: string;
  citations: { id: string; kbId: string }[];
  degraded: null | "rerank_unavailable";
  partial: boolean;
  no_context: boolean;
}

/** Adapt the recall-text resolver to ask's ChunkResolver (id -> grounding text). */
class TextResolverAdapter implements ChunkResolver {
  constructor(private inner: RecallTextResolver) {}
  async resolve(ids: string[]): Promise<ChunkText[]> {
    return (await this.inner.resolve(ids)).map((t) => ({ id: t.id, kbId: t.kbId, content: t.text }));
  }
}

export async function askTool(caller: CallerContext, args: Record<string, unknown>, deps: AskToolDeps): Promise<AskToolResult> {
  const ws = caller.workspace as string;
  const visibleSet = await deps.visibleSet.resolve({ org: caller.org, ws, product: caller.callerProduct, user: caller.user });
  const attached = await deps.attachments.listKbIds(ws, caller.user ?? "", caller.callerProduct);
  const kbIds = Array.isArray(args.kb_ids) ? (args.kb_ids as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
  const scope = resolveScope({ visibleSet, attached, kbIds });

  const result = await runAsk({
    query: typeof args.question === "string" ? args.question : "",
    scope,
    recallers: [new Bm25Recaller(deps.corpus)],
    reranker: new UnavailableReranker(),
    tenantId: caller.org ?? "",
    workspaceId: ws,
    userId: caller.user ?? undefined,
    modelCode: deps.model,
    resolver: new TextResolverAdapter(deps.textResolver),
    generation: deps.generation,
    contextK: typeof args.top_k === "number" && args.top_k > 0 ? args.top_k : 5,
  });

  // Per-call metering (catalog: karda.ask -> per_call). Only a call that actually
  // generated is billable; a no-context answer did not hit the model, so it is
  // not metered. Best-effort.
  if (!result.noContext) {
    try {
      await recordUsage({ workspaceId: ws, metric: "karda.ask", amount: 1, idempotencyKey: `karda.ask:${randomUUID()}` });
    } catch {
      // swallow - metering is off the critical path.
    }
  }

  return {
    answer: result.answer,
    citations: result.citations,
    degraded: result.degraded,
    partial: result.partial,
    no_context: result.noContext,
  };
}
