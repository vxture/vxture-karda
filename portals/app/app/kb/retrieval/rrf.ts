// Reciprocal Rank Fusion (120-retrieval-tools 2). RRF merges two ranked lists
// (vector + BM25) WITHIN a namespace, by rank not score - which sidesteps the
// fragile business of normalizing incomparable score scales. It is deliberately
// NOT used across namespaces; that merge happens only at rerank (section 2,
// "recall cheap, rerank once").
//
// Pure logic and fully tested here. The vector list is empty until Atlas A1
// ships (TD-004), so in 6a fusion runs over the BM25 list alone - and RRF over a
// single list must degrade to that list's order, which is one of the tests.

export interface Ranked {
  /** Recall-unit id (chunk or entry). */
  id: string;
  /** Rank position, 0-based, within its own list. */
  rank: number;
}

export interface Fused {
  id: string;
  /** RRF score - higher is better. Only meaningful within this fusion. */
  score: number;
}

export const RRF_K = 60; // the standard constant (Elastic/Azure/Vespa default)

/**
 * Fuse ranked lists by RRF: score(id) = sum over lists of 1/(k + rank). An id
 * present in more lists, or higher in them, scores higher. Ties break by id so
 * the output is deterministic.
 */
export function rrfFuse(lists: Ranked[][], k: number = RRF_K): Fused[] {
  const acc = new Map<string, number>();
  for (const list of lists) {
    for (const { id, rank } of list) {
      acc.set(id, (acc.get(id) ?? 0) + 1 / (k + rank));
    }
  }
  return [...acc.entries()]
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** Build a Ranked list from an id array already in descending relevance. */
export function toRanked(idsInOrder: string[]): Ranked[] {
  return idsInOrder.map((id, rank) => ({ id, rank }));
}
