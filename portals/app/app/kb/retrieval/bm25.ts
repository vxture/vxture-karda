// BM25 lexical ranking (TD-008; 120-retrieval-tools 2, the BM25 half of the dual
// recall). Pure and self-contained: given a corpus of {id, text} and a query, it
// returns ids in descending relevance. The Recaller that feeds it the recallable
// corpus is bm25-recaller.ts; this file is only the scoring function, so it is
// exhaustively testable with no store, no index service, no A1.
//
// Standard Okapi BM25 with the BM25+ IDF (the `ln(1 + ...)` form, which is always
// non-negative, so a term appearing in most documents never contributes a
// negative score and cannot push a matching doc below a non-matching one).

export interface Bm25Doc {
  id: string;
  text: string;
}

export interface Bm25Params {
  /** Term-frequency saturation. Higher = TF matters more before flattening. */
  k1: number;
  /** Length normalisation. 0 = off, 1 = full. */
  b: number;
}

export const DEFAULT_BM25: Bm25Params = { k1: 1.5, b: 0.75 };

/** Lowercase, split on non-alphanumeric. Good enough for v1; a stemmer/stopword
 *  list is a later refinement that does not change the ranking contract. */
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

export interface Scored {
  id: string;
  score: number;
}

/**
 * Rank `docs` against `query` by BM25. Returns only documents with a positive
 * score (at least one query term present), highest first; ties break by id so the
 * order is deterministic. An empty corpus or an all-stopword query yields [].
 */
export function bm25Rank(docs: Bm25Doc[], query: string, params: Bm25Params = DEFAULT_BM25): Scored[] {
  const n = docs.length;
  if (n === 0) return [];

  const tokenized = docs.map((d) => ({ id: d.id, tokens: tokenize(d.text) }));
  const lengths = tokenized.map((d) => d.tokens.length);
  const avgdl = lengths.reduce((a, l) => a + l, 0) / n || 1;

  // Document frequency per term (once per doc).
  const df = new Map<string, number>();
  for (const d of tokenized) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }

  const qTerms = [...new Set(tokenize(query))];
  const idf = new Map<string, number>();
  for (const t of qTerms) {
    const dfT = df.get(t) ?? 0;
    idf.set(t, Math.log(1 + (n - dfT + 0.5) / (dfT + 0.5)));
  }

  const out: Scored[] = [];
  for (let i = 0; i < tokenized.length; i++) {
    const tf = new Map<string, number>();
    for (const t of tokenized[i].tokens) tf.set(t, (tf.get(t) ?? 0) + 1);

    let score = 0;
    for (const t of qTerms) {
      const f = tf.get(t);
      if (!f) continue;
      const denom = f + params.k1 * (1 - params.b + params.b * (lengths[i] / avgdl));
      score += (idf.get(t) ?? 0) * ((f * (params.k1 + 1)) / denom);
    }
    if (score > 0) out.push({ id: tokenized[i].id, score });
  }

  return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
