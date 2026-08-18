// The vector Recaller (6b): the second recall path the chain was built to fuse
// (search.ts: "the chain fuses whatever recallers it is given"). Embed the query
// via Atlas A1, cosine-rank the stored chunk vectors, return top-N RecallHits.
//
// Two deliberate behaviors:
// - MODEL LOCK (KD-107, grant-driven per KD-018): the query embeds by grant
//   routing (or a pin) and the embedder reports WHICH model resolved; only
//   chunk vectors stored under that same model_code are ranked. Chunks
//   embedded under another model are simply not vector-recalled (BM25 still
//   covers them) - comparing across vector spaces silently ranks garbage,
//   which is worse than a narrower recall. When the Atlas-side grant moves to
//   a new model, old chunks drop out of vector recall until reprocessed - a
//   visible, safe degradation, never a silent space mix.
// - SELF-DEGRADE: an Atlas failure here returns [] instead of throwing. A
//   thrown recaller would fail the whole namespace (Promise.all in runSearch)
//   and take the healthy BM25 path down with it; vector recall being down must
//   degrade search to lexical-only, not to partial.
import type { Recaller, RecallQuery, RecallHit } from "./search";
import { passesVerificationFilter } from "../lib/state";
import type { VectorCorpus } from "./vector-corpus";
import type { EmbedResult } from "../processing/orchestrator";

/** Embeds one query text and reports the resolved model. Backed by
 *  AtlasEmbedClient (pin null = grant-routed). */
export interface QueryEmbedder {
  embed(texts: string[], modelPin: string | null): Promise<EmbedResult>;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export class VectorRecaller implements Recaller {
  constructor(
    private corpus: VectorCorpus,
    private embedder: QueryEmbedder,
  ) {}

  async recall(q: RecallQuery): Promise<RecallHit[]> {
    if (q.kbIds.length === 0 || !q.query.trim()) return [];
    try {
      const { vectors, modelCode } = await this.embedder.embed([q.query], null);
      const qv = vectors[0];
      if (!qv) return [];

      const units = (await this.corpus.vectors(q.kbIds)).filter(
        (u) =>
          u.modelCode === modelCode &&
          passesVerificationFilter(q.verificationFilter, u.verificationState),
      );

      return units
        .map((u) => ({ id: u.id, kbId: u.kbId, score: cosineSimilarity(qv, u.vector) }))
        .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : 1))
        .slice(0, q.topN)
        .map((u) => ({ id: u.id, kbId: u.kbId }));
    } catch {
      // Self-degrade: vector recall unavailable -> lexical-only search, not a
      // namespace failure. The chain's `partial` flag is reserved for a whole
      // namespace going dark, which this is not.
      return [];
    }
  }
}
