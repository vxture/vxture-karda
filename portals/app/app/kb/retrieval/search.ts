// The retrieval evaluation chain (120-retrieval-tools 1): scope -> dual-path
// recall per namespace -> RRF within a namespace -> unified rerank across
// namespaces -> assemble. Composed over injected ports so the whole chain is
// testable without a vector index or Atlas.
//
// The degrade contract (section 1) is the part that most needs care and most
// needs the security floor to hold THROUGH it: rerank unavailable falls back to
// RRF order tagged `degraded`, a single namespace timing out returns the rest
// tagged `partial` - and neither path may return anything outside the whitelist.
import { rrfFuse, toRanked, type Fused } from "./rrf";
import type { ResolvedScope, Namespace, ScopedKb } from "./scope";
import { DEFAULT_VERIFICATION_FILTER, type VerificationFilter } from "../lib/state";

// --- ports ------------------------------------------------------------------

export interface RecallHit {
  id: string; // chunk or entry id
  kbId: string;
}

export interface RecallQuery {
  query: string;
  namespace: Namespace;
  kbIds: string[];
  verificationFilter: VerificationFilter;
  topN: number;
}

export interface Recaller {
  /** BM25 recall for a namespace. Vector recall is a second Recaller, absent
   *  until A1; the chain fuses whatever recallers it is given. */
  recall(q: RecallQuery): Promise<RecallHit[]>;
}

export interface Reranker {
  /** Score (query, candidate) pairs globally. Throws when unavailable (A3). */
  rerank(query: string, candidates: RecallHit[]): Promise<{ id: string; score: number }[]>;
}

// --- params (KD-009) --------------------------------------------------------

export interface SearchParams {
  perNamespaceN: number; // N=50
  poolCap: number; // 100
  topK: number; // 10
  verificationFilter: VerificationFilter;
}

export const DEFAULT_SEARCH_PARAMS: SearchParams = {
  perNamespaceN: 50,
  poolCap: 100,
  topK: 10,
  verificationFilter: DEFAULT_VERIFICATION_FILTER,
};

// --- result -----------------------------------------------------------------

export interface SearchResultItem {
  id: string;
  kbId: string;
  score: number;
}

export interface SearchResult {
  items: SearchResultItem[];
  degraded: null | "rerank_unavailable";
  partial: boolean; // a namespace failed to return
  ignoredKbIds: string[];
}

export interface SearchInput {
  query: string;
  scope: ResolvedScope;
  /** One or more recallers per namespace (BM25 now; +vector when A1 ships). */
  recallers: Recaller[];
  reranker: Reranker;
  params?: SearchParams;
}

/**
 * Run the evaluation chain. Every hit is checked against the whitelist before it
 * can appear in the output - the intersection in scope resolution is the intent,
 * this is the enforcement, and it runs on the degrade paths too so a fallback
 * cannot leak a kb the caller cannot see.
 */
export async function runSearch(input: SearchInput): Promise<SearchResult> {
  const params = input.params ?? DEFAULT_SEARCH_PARAMS;
  const allowedKb = new Set(input.scope.whitelist.map((k) => k.kbId));
  const byNs = groupByNamespace(input.scope.whitelist);

  if (allowedKb.size === 0) {
    // Empty scope: nothing to search. Not an error - the caller simply sees
    // nothing, which is the correct answer, not a leak.
    return { items: [], degraded: null, partial: false, ignoredKbIds: input.scope.ignoredKbIds };
  }

  // --- recall + RRF, per namespace, tolerating a namespace failure -----------
  let partial = false;
  const pooled: RecallHit[] = [];

  for (const [namespace, kbs] of byNs) {
    const kbIds = kbs.map((k) => k.kbId);
    try {
      // each recaller (bm25, later vector) produces a ranked list; RRF fuses them
      const lists = await Promise.all(
        input.recallers.map(async (r) => {
          const hits = await r.recall({
            query: input.query,
            namespace,
            kbIds,
            verificationFilter: params.verificationFilter,
            topN: params.perNamespaceN,
          });
          // enforce the whitelist at the recall boundary, defensively
          const safe = hits.filter((h) => allowedKb.has(h.kbId));
          return { hits: safe, ranked: toRanked(safe.map((h) => h.id)) };
        }),
      );
      const idToHit = new Map<string, RecallHit>();
      for (const l of lists) for (const h of l.hits) idToHit.set(h.id, h);
      const fused = rrfFuse(lists.map((l) => l.ranked)).slice(0, params.perNamespaceN);
      for (const f of fused) {
        const hit = idToHit.get(f.id);
        if (hit) pooled.push(hit);
      }
    } catch {
      // a namespace failing does not block the others (section 1 degrade)
      partial = true;
    }
  }

  const pool = pooled.slice(0, params.poolCap);
  if (pool.length === 0) {
    return { items: [], degraded: null, partial, ignoredKbIds: input.scope.ignoredKbIds };
  }

  // --- unified rerank across namespaces, with degrade to RRF order -----------
  let items: SearchResultItem[];
  let degraded: SearchResult["degraded"] = null;
  try {
    const scored = await input.reranker.rerank(input.query, pool);
    const kbOf = new Map(pool.map((h) => [h.id, h.kbId]));
    items = scored
      .filter((s) => allowedKb.has(kbOf.get(s.id) ?? "")) // whitelist holds through rerank
      .map((s) => ({ id: s.id, kbId: kbOf.get(s.id)!, score: s.score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, params.topK);
  } catch {
    // rerank unavailable (A3 unbuilt, or a live outage): fall back to RRF order.
    // Re-fuse the pool as a single list, keep the whitelist, tag degraded.
    degraded = "rerank_unavailable";
    const fusedPool: Fused[] = rrfFuse([toRanked(pool.map((h) => h.id))]);
    const kbOf = new Map(pool.map((h) => [h.id, h.kbId]));
    items = fusedPool
      .filter((f) => allowedKb.has(kbOf.get(f.id) ?? ""))
      .map((f) => ({ id: f.id, kbId: kbOf.get(f.id)!, score: f.score }))
      .slice(0, params.topK);
  }

  return { items, degraded, partial, ignoredKbIds: input.scope.ignoredKbIds };
}

function groupByNamespace(kbs: ScopedKb[]): Map<Namespace, ScopedKb[]> {
  const m = new Map<Namespace, ScopedKb[]>();
  for (const k of kbs) {
    const arr = m.get(k.namespace) ?? [];
    arr.push(k);
    m.set(k.namespace, arr);
  }
  return m;
}

// --- the rerank stub (A3 unbuilt) -------------------------------------------

/** Reranker used until Atlas A3 ships: always unavailable, so search degrades to
 *  RRF order. Wiring the real client later changes only which reranker is
 *  injected; the chain and its whitelist enforcement are unchanged. */
export class UnavailableReranker implements Reranker {
  async rerank(): Promise<{ id: string; score: number }[]> {
    throw new Error("rerank capability (Atlas A3) is not yet available");
  }
}
