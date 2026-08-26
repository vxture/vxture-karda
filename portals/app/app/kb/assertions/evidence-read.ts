// `karda.get_evidence` - what a citation actually rests on.
//
// The question an agent asks after it has been given an answer: not "what is in
// this library" but "据谁所说、何时、哪一版" - yucer made those three a hard
// condition for external knowledge entering their judgment path (#103 Q14), and
// row-level provenance does not answer them. This is the tool that does.
//
// The join is arithmetic, not a heuristic: a citation identifies a chunk, an
// assertion is anchored to a span, and since 0007 both index into the same
// canonical document text - so "which assertions does this citation rest on" is
// a range intersection (`overlap.ts`).

import type { SpanRange, ChunkRange } from "./overlap";
import { spansForChunk, hasSourceRange } from "./overlap";

/** Why a lookup returned nothing. The distinction is the point: "this citation
 *  predates source ranges" and "nothing has been extracted here" are different
 *  facts about the corpus and must not read the same to a caller deciding
 *  whether to trust an answer. */
export type EvidenceStatus =
  | "ok"
  | "no_source_range" // the chunk predates incr/0007; the question cannot be answered for it
  | "no_assertions"; // the range is known and nothing has been extracted from it

export interface AssertionProvenance {
  assertionId: string;
  kind: string;
  subject: string | null;
  statement: string;
  /** WHO SAID IT, inside the source. Null means the source did not state one -
   *  which is a fact worth reporting, not a blank to hide. */
  assertedBy: string | null;
  asOf: string | null;
  validUntil: string | null;
  /** WHICH VERSION of the document the grounds were read from. */
  documentVersion: number;
  /** What the span quotes, as it was read. */
  excerpt: string;
  verificationState: string;
  /** Present when a conflict was adjudicated and THIS assertion lost. An agent
   *  that cited the old value needs to be able to find out what replaced it. */
  supersededBy: string | null;
  /** The source DOCUMENT's verification state at read time - KD-209's
   *  "consultable signal". Never copied onto the assertion; read through the
   *  chain each time, so it is always current. */
  sourceDocumentVerification: string | null;
}

export interface EvidenceResult {
  status: EvidenceStatus;
  citationId: string;
  documentId: string | null;
  assertions: AssertionProvenance[];
}

/** One assertion as the store hands it back, joined to the span that grounds it. */
export interface GroundedAssertionRow {
  assertionId: string;
  kind: string;
  subject: string | null;
  statement: string;
  assertedBy: string | null;
  asOf: string | null;
  validUntil: string | null;
  verificationState: string;
  supersededById: string | null;
  span: SpanRange & { excerpt: string };
  sourceDocumentVerification: string | null;
}

/**
 * Shape a lookup, given the chunk and every grounded assertion in its document
 * version. Pure, so the rules below are testable without a database.
 *
 * Ordering: by where the grounds sit in the document. Not by confidence, and
 * not by verification - a provenance answer is a reading of a passage, and
 * reordering it by a quality score would quietly editorialise what the source
 * says.
 */
export function shapeEvidence(
  chunk: ChunkRange,
  candidates: GroundedAssertionRow[],
): EvidenceResult {
  if (!hasSourceRange(chunk)) {
    return { status: "no_source_range", citationId: chunk.chunkId, documentId: chunk.documentId, assertions: [] };
  }

  const spans = candidates.map((c) => c.span);
  const hit = new Set(spansForChunk(chunk, spans).map((s) => s.spanId));

  const assertions = candidates
    .filter((c) => hit.has(c.span.spanId))
    .sort((a, b) => a.span.startOffset - b.span.startOffset)
    .map<AssertionProvenance>((c) => ({
      assertionId: c.assertionId,
      kind: c.kind,
      subject: c.subject,
      statement: c.statement,
      assertedBy: c.assertedBy,
      asOf: c.asOf,
      validUntil: c.validUntil,
      documentVersion: c.span.documentVersion,
      excerpt: c.span.excerpt,
      verificationState: c.verificationState,
      supersededBy: c.supersededById,
      sourceDocumentVerification: c.sourceDocumentVerification,
    }));

  return {
    status: assertions.length > 0 ? "ok" : "no_assertions",
    citationId: chunk.chunkId,
    documentId: chunk.documentId,
    assertions,
  };
}

/**
 * The answer for a citation the caller may not see, or that does not exist.
 *
 * These two cases MUST be indistinguishable. If "not visible to you" read
 * differently from "no such citation", `get_evidence` would become an oracle
 * for probing which chunk ids exist in libraries the caller has no access to -
 * one call per guess. The tool answers the same way to both.
 */
export function evidenceNotFound(citationId: string): EvidenceResult {
  return { status: "no_assertions", citationId, documentId: null, assertions: [] };
}
