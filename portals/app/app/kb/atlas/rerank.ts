// The Atlas A3 rerank client (KD-102; TD-004 closure). POST /v1/rerank with
// { taskId, query, candidates, workspaceId, modelCode|taskProfile }.
//
// Two contract facts shape this client (Atlas #89 + the 2026-08-18 interface
// doc):
// - candidate cap is 100, HARD-REJECTED not truncated (CANDIDATE_POOL_TOO_LARGE)
//   - karda's pool cap is already 100 (KD-009), and we defensively slice anyway;
// - the score distribution is highly compressed: ORDER is reliable, absolute
//   thresholds are not. So this client returns scores for ordering only and no
//   karda code may build a "score > X means relevant" rule on them.
//
// The chain's degrade contract does the rest: any throw here falls back to RRF
// order tagged `degraded: "rerank_unavailable"` (search.ts), so rerank outages
// (PROVIDER_UNAVAILABLE - deliberately NOT a RERANK_UNAVAILABLE alias, Atlas
// X-4) degrade rather than fail the search.
import type { RecallHit, Reranker } from "../retrieval/search";
import { atlasPost, type AtlasClientCore, type AtlasContext } from "./client";

export const DEFAULT_ATLAS_RERANK_PATH = "/v1/rerank";
export const RERANK_CANDIDATE_CAP = 100;

/** Resolves candidate ids to the texts the cross-encoder scores. */
export interface CandidateTextResolver {
  resolve(ids: string[]): Promise<{ id: string; text: string }[]>;
}

export interface RerankSelection {
  modelCode?: string;
  taskProfile?: string;
}

/**
 * Model selection for rerank, mirroring askModelSelection (KD-109): exactly one
 * of taskProfile / modelCode, from ATLAS_RERANK_TASK_PROFILE else
 * ATLAS_RERANK_MODEL. Returns null when neither is set - the caller then keeps
 * the UnavailableReranker and search degrades honestly instead of sending a
 * request Atlas will 400 (TARGET_SELECTOR_REQUIRED).
 */
export function rerankSelection(): RerankSelection | null {
  const taskProfile = process.env.ATLAS_RERANK_TASK_PROFILE;
  if (taskProfile) return { taskProfile };
  const modelCode = process.env.ATLAS_RERANK_MODEL;
  if (modelCode) return { modelCode };
  return null;
}

/** Tolerant score extraction: {results:[{index,score|relevanceScore}]} or a
 *  bare {scores:[...]} aligned to the candidate order. */
export function extractScores(body: unknown, count: number): { index: number; score: number }[] | null {
  if (!body || typeof body !== "object") return null;
  const o = body as Record<string, unknown>;
  if (Array.isArray(o.results)) {
    const out: { index: number; score: number }[] = [];
    for (const r of o.results) {
      if (!r || typeof r !== "object") return null;
      const row = r as Record<string, unknown>;
      const index = typeof row.index === "number" ? row.index : null;
      const score =
        typeof row.score === "number" ? row.score : typeof row.relevanceScore === "number" ? row.relevanceScore : null;
      if (index === null || score === null || index < 0 || index >= count) return null;
      out.push({ index, score });
    }
    return out;
  }
  if (Array.isArray(o.scores) && o.scores.every((s) => typeof s === "number") && o.scores.length === count) {
    return (o.scores as number[]).map((score, index) => ({ index, score }));
  }
  return null;
}

export interface RerankCallContext {
  context: () => Promise<AtlasContext>;
  taskId: string;
}

export class AtlasReranker implements Reranker {
  constructor(
    private core: AtlasClientCore,
    private call: RerankCallContext,
    private texts: CandidateTextResolver,
    private selection: RerankSelection,
    private rerankPath: string = process.env.ATLAS_RERANK_PATH || DEFAULT_ATLAS_RERANK_PATH,
  ) {}

  async rerank(query: string, candidates: RecallHit[]): Promise<{ id: string; score: number }[]> {
    const pool = candidates.slice(0, RERANK_CANDIDATE_CAP);
    const resolved = await this.texts.resolve(pool.map((c) => c.id));
    const byId = new Map(resolved.map((t) => [t.id, t.text]));
    // Keep only candidates whose text resolved; the id list below is the index
    // space the response's `index` refers to.
    const withText = pool.filter((c) => byId.has(c.id));
    if (withText.length === 0) return [];

    const ctx = await this.call.context();
    const body = await atlasPost(this.core, this.rerankPath, ctx, {
      taskId: this.call.taskId,
      query,
      candidates: withText.map((c) => byId.get(c.id) as string),
      workspaceId: ctx.ws,
      ...this.selection,
    });

    const scores = extractScores(body, withText.length);
    if (!scores) throw new Error("atlas rerank: unrecognized response shape");
    return scores.map((s) => ({ id: withText[s.index].id, score: s.score }));
  }
}
