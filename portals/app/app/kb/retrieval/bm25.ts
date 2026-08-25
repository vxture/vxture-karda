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

/**
 * Tokenize for BM25.
 *
 * TWO ALPHABETS, TWO RULES, because this is a CHINESE-FIRST product and the
 * original `[a-z0-9]+` silently dropped every CJK character. The effect was not
 * "slightly worse Chinese ranking" - it was that a Chinese query produced ZERO
 * tokens and therefore zero lexical hits against Chinese content, on the only
 * recaller that is currently live (vector recall waits on Atlas A1). Found by
 * walking batch 13's 检验台 through with real Chinese content.
 *
 *   · Latin/digits  - lowercase, split on non-alphanumeric, as before.
 *   · CJK           - OVERLAPPING CHARACTER BIGRAMS. "单架次时长" indexes as
 *                     单架 / 架次 / 次时 / 时长, so a query for 单架次 matches on
 *                     单架 + 架次 without anyone owning a segmentation
 *                     dictionary. This is what Lucene's CJK analyzer does, and
 *                     it is chosen deliberately over word segmentation: a
 *                     dictionary is a dependency, needs maintenance, and gets
 *                     domain terms wrong in exactly the technical corpora karda
 *                     is for. Bigrams over-generate slightly; BM25's IDF term
 *                     already discounts the common pairs that result.
 *
 * A single CJK character standing alone (a one-character run) is emitted as
 * itself - otherwise a query like 雨 would tokenize to nothing at all.
 */
const CJK_CLASS = "\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af";
const CJK = new RegExp(`[${CJK_CLASS}]`);
const CJK_RUN = new RegExp(`[${CJK_CLASS}]+`, "g");

export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const run of text.toLowerCase().match(/[a-z0-9]+|[^a-z0-9\s]+/g) ?? []) {
    if (!CJK.test(run)) {
      // Latin/digit run, or punctuation-only (which yields nothing useful).
      if (/^[a-z0-9]+$/.test(run)) out.push(run);
      continue;
    }
    // Split into MAXIMAL CJK STRETCHES. Filtering the non-CJK characters out of
    // the run instead would join what they separated: "时长，复核" would become
    // 时长复核 and emit 长复, a bigram that spans a comma and means nothing.
    for (const stretch of run.match(CJK_RUN) ?? []) {
      const chars = [...stretch];
      if (chars.length === 1) {
        // A lone character must still be emitted, or a one-character query
        // tokenizes to nothing and can never match.
        out.push(chars[0]);
        continue;
      }
      for (let i = 0; i < chars.length - 1; i++) out.push(chars[i] + chars[i + 1]);
    }
  }
  return out;
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
