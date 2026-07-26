// The BM25 Recaller (TD-008): the concrete recall backend the evaluation chain
// (search.ts) has been waiting for. It fetches the recallable corpus for the
// query's libraries, applies the quality-tier (verification) filter, ranks by
// BM25, and returns the top-N as RecallHits. Vector recall is a SECOND Recaller
// added when Atlas A1 ships; the chain fuses whatever recallers it is given, so
// wiring this one is all that is needed to move search/ask off "not_implemented".
import type { Recaller, RecallQuery, RecallHit } from "./search";
import { passesVerificationFilter } from "../lib/state";
import { bm25Rank } from "./bm25";
import type { RecallCorpus } from "./corpus";

export class Bm25Recaller implements Recaller {
  constructor(private corpus: RecallCorpus) {}

  async recall(q: RecallQuery): Promise<RecallHit[]> {
    if (q.kbIds.length === 0) return [];

    // The corpus already enforces the `indexed` hard filter (100-kb-model 6);
    // this applies the verification quality tier on top (the default excludes
    // `stale` but keeps `unverified`).
    const units = (await this.corpus.units(q.kbIds)).filter((u) =>
      passesVerificationFilter(q.verificationFilter, u.verificationState),
    );

    const ranked = bm25Rank(
      units.map((u) => ({ id: u.id, text: u.text })),
      q.query,
    );
    const kbOf = new Map(units.map((u) => [u.id, u.kbId]));
    return ranked.slice(0, q.topN).map((r) => ({ id: r.id, kbId: kbOf.get(r.id) as string }));
  }
}
