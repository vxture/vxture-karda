// The assertion vocabulary, in one place.
//
// Five kinds on ONE table rather than five tables (140-assertion-model §3.1):
// their field needs are identical - subject, statement, validity window,
// source, confidence - and the difference is semantic. Five tables would have
// meant five copies of the provenance and governance logic from day one.

export const ASSERTION_KINDS = ["fact", "claim", "event", "procedure", "rule"] as const;
export type AssertionKind = (typeof ASSERTION_KINDS)[number];

/** The stance an evidence edge takes toward the assertion it points at.
 *  `contradicts` is where conflict detection lands. */
export const EVIDENCE_STANCES = ["supports", "contradicts"] as const;
export type EvidenceStance = (typeof EVIDENCE_STANCES)[number];

/**
 * Is this assertion admissible to retrieval?
 *
 * The rule is not a cleanup policy, it is a definition: an assertion with no
 * evidence has no grounds, and grounded answers are this product's premise.
 * It is enforced at READ time precisely so it holds whether or not any sweep
 * has run - see 140-assertion-model §7, which was rewritten after a live probe
 * showed that deleting a document leaves its assertions standing with zero
 * evidence (a foreign key cannot express "lost its LAST edge").
 *
 * The write-side recall (KD-206: a deletion request means the rows must go)
 * is a separate, asynchronous sweep. Doing the sweep WITHOUT this filter would
 * mean ungrounded assertions stay citable until it next runs.
 */
export function isRecallable(a: {
  contentState: string;
  evidenceCount: number;
  supersededById?: string | null;
}): boolean {
  if (a.evidenceCount <= 0) return false;
  if (a.supersededById) return false; // a conflict was adjudicated and this one lost
  return a.contentState === "indexed";
}

/**
 * Does machine confidence take part in ranking?
 *
 * KD-210: before a person confirms it, confidence is the only quality signal an
 * assertion has. After confirmation, `verified` is the stronger signal, and
 * letting a model score keep contributing would dilute the human judgement -
 * a confirmed assertion should not rank lower because the extractor was unsure.
 *
 * Confidence is never CLEARED, only ignored: it is the record of how the
 * extractor performed, and clearing it removes the only way to judge one.
 */
export function confidenceWeight(a: { verificationState: string; confidence: number | null }): number | null {
  if (a.verificationState === "verified") return null;
  return a.confidence;
}
