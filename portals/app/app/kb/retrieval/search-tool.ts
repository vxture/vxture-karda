// karda.search wiring (TD-008): compose the scope + the BM25 recaller + the
// (degrading) rerank into the evaluation chain, so dispatch can return a real
// search instead of not_implemented. The security floor is resolveScope's
// whitelist (visible-set INTERSECT attachment); runSearch enforces it through
// every degrade path. Vector recall and the real reranker plug in later as a
// second recaller and a real Reranker - this wiring does not change when they do.
import { randomUUID } from "node:crypto";
import { runSearch, DEFAULT_SEARCH_PARAMS, UnavailableReranker } from "./search";
import { resolveScope } from "./scope";
import { verificationFilterOf, topKOf } from "./params";
import { Bm25Recaller } from "./bm25-recaller";
import type { RecallCorpus, RecallTextResolver } from "./corpus";
import type { VisibleSetResolver } from "./visible-set";
import type { AttachmentStore } from "../attachments/store";
import { recordUsage } from "../../usage/lib/buffer";
import type { CallerContext } from "../tools/s2s";
import { retrievalAtlas, type RetrievalAtlas } from "../atlas/wiring";
import { taskIdOr } from "../atlas/client";

export interface SearchToolDeps {
  visibleSet: VisibleSetResolver;
  attachments: AttachmentStore;
  corpus: RecallCorpus;
  /** Candidate texts for the cross-encoder; without it rerank stays degraded. */
  textResolver?: RecallTextResolver;
}

export interface SearchToolResult {
  items: { id: string; kbId: string; score: number }[];
  degraded: null | "rerank_unavailable";
  partial: boolean;
  ignored_kb_ids: string[];
}



/**
 * Run a search for an authenticated caller. dispatch has already applied the mode
 * gate and guaranteed a workspace; this resolves the scope (visible INTERSECT
 * attached, narrowed by kb_ids), recalls with BM25, degrades rerank to RRF order,
 * and meters the call. An empty scope (nothing visible/attached) returns an empty
 * result - the correct answer, not a leak.
 */
export async function searchTool(caller: CallerContext, args: Record<string, unknown>, deps: SearchToolDeps): Promise<SearchToolResult> {
  const ws = caller.workspace as string;
  const user = caller.user;
  const product = caller.callerProduct;

  const visibleSet = await deps.visibleSet.resolve({ org: caller.org, ws, product, user });
  const attached = await deps.attachments.listKbIds(ws, user ?? "", product);
  const kbIds = Array.isArray(args.kb_ids) ? (args.kb_ids as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
  // Preset libraries the caller merges explicitly by id (product_110 D5): they
  // bypass the attachment list - the path a SERVICE caller (no user, so no
  // attachments) names its libraries through - but still must be visible.
  const presetKbIds = Array.isArray(args.preset_kb_ids)
    ? (args.preset_kb_ids as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;

  const scope = resolveScope({ visibleSet, attached, kbIds, presetKbIds });

  // Atlas-side retrieval pieces (6b): a caller-threaded task_id (or a per-call
  // work-unit id) keys this call's Atlas consumption; vector recall + rerank
  // wire in only when configured, and the chain degrades whatever is absent.
  const taskId = taskIdOr(args.task_id, `karda:search:${randomUUID()}`);
  const atlas: RetrievalAtlas =
    caller.org && deps.textResolver
      ? retrievalAtlas({ org: caller.org, ws }, taskId, { texts: deps.textResolver })
      : { vectorRecaller: null, reranker: null };

  const result = await runSearch({
    query: typeof args.query === "string" ? args.query : "",
    scope,
    recallers: [new Bm25Recaller(deps.corpus), ...(atlas.vectorRecaller ? [atlas.vectorRecaller] : [])],
    reranker: atlas.reranker ?? new UnavailableReranker(),
    params: { ...DEFAULT_SEARCH_PARAMS, topK: topKOf(args.top_k), verificationFilter: verificationFilterOf(args.verification_filter) },
  });

  // Per-call metering (catalog: karda.search -> per_call). A random key per call
  // (no request jti is threaded here) means a retry is not deduped - acceptable
  // for a per-call metric; best-effort so a buffer hiccup never fails the search.
  try {
    await recordUsage({ workspaceId: ws, metric: "karda.search", amount: 1, idempotencyKey: `karda.search:${randomUUID()}` });
  } catch {
    // swallow - metering is off the query's critical path.
  }

  return { items: result.items, degraded: result.degraded, partial: result.partial, ignored_kb_ids: result.ignoredKbIds };
}
