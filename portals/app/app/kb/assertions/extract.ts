// Turning an extractor's raw output into rows the corpus will accept.
//
// Separated from the model call and from the database on purpose. The Atlas
// side of extraction is blocked on a `karda.extract` task profile (KD-018:
// models travel by grant, not by config), and the store needs a live Postgres -
// so if the rules below lived with either of them, none of their edge cases
// would ever get a test. They are the rules that decide what enters the
// knowledge corpus; they are the last place to accept "we will check it later".
//
// The shape this module defends, in one line: an assertion that cannot be
// anchored to a span of a specific document version is not admissible.

import type { AssertionKind } from "./kinds";

/** One statement as an extractor reports it, before anything has validated it. */
export interface RawAssertion {
  kind: string;
  subject?: string | null;
  statement: string;
  /** WHO SAID IT, inside the source. Never the uploader, never the model. */
  assertedBy?: string | null;
  asOf?: string | null;
  validUntil?: string | null;
  /** Character range in the document text the extractor was given. */
  startOffset: number;
  endOffset: number;
  confidence?: number | null;
  /** Entities the statement names, by surface form. Resolved to rows later. */
  mentions?: string[];
}

/** What the caller must tell us about the text that was extracted FROM. */
export interface ExtractionSource {
  documentId: string;
  /** The version the extractor read. Provenance is meaningless without it. */
  documentVersion: number;
  /** Length of the text handed to the extractor, so offsets can be bounds-checked. */
  textLength: number;
}

/** An admissible assertion plus the span it is anchored to. */
export interface PreparedAssertion {
  kind: AssertionKind;
  subject: string | null;
  statement: string;
  assertedBy: string | null;
  asOf: string | null;
  validUntil: string | null;
  confidence: number | null;
  span: {
    documentId: string;
    documentVersion: number;
    startOffset: number;
    endOffset: number;
    excerpt: string;
  };
  mentions: string[];
}

export type RejectReason =
  | "unknown_kind"
  | "empty_statement"
  | "offsets_out_of_range"
  | "offsets_inverted"
  | "confidence_out_of_range"
  | "validity_window_inverted";

export interface Rejected {
  reason: RejectReason;
  statement: string;
}

export interface PreparedBatch {
  accepted: PreparedAssertion[];
  /** Kept, not discarded: an extractor that produces rejects at a rate is a
   *  fact about the extractor, and silently dropping them hides it. */
  rejected: Rejected[];
}

const KINDS: readonly AssertionKind[] = ["fact", "claim", "event", "procedure", "rule"];

function isKind(v: string): v is AssertionKind {
  return (KINDS as readonly string[]).includes(v);
}

/** ISO-8601 or nothing. A date the database would reject is a reject here. */
function isoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

/**
 * Validate an extractor's output against the corpus's admission rules.
 *
 * Every rejection below is something the DDL would also refuse - the point of
 * checking here is that a batch of 1,180 statements must not be lost because
 * one of them had a bad offset. Rejects are reported, the rest goes in.
 */
export function prepare(raw: RawAssertion[], source: ExtractionSource, text: string): PreparedBatch {
  const accepted: PreparedAssertion[] = [];
  const rejected: Rejected[] = [];

  for (const r of raw) {
    const statement = (r.statement ?? "").trim();
    if (!statement) {
      rejected.push({ reason: "empty_statement", statement: r.statement ?? "" });
      continue;
    }
    if (!isKind(r.kind)) {
      rejected.push({ reason: "unknown_kind", statement });
      continue;
    }
    if (!Number.isInteger(r.startOffset) || !Number.isInteger(r.endOffset)) {
      rejected.push({ reason: "offsets_out_of_range", statement });
      continue;
    }
    if (r.endOffset <= r.startOffset) {
      rejected.push({ reason: "offsets_inverted", statement });
      continue;
    }
    // Bounds-checked against the text the extractor was GIVEN, not against the
    // current document: a model that hallucinates a range past the end of its
    // own input would otherwise produce a span that quotes nothing.
    if (r.startOffset < 0 || r.endOffset > source.textLength) {
      rejected.push({ reason: "offsets_out_of_range", statement });
      continue;
    }
    if (r.confidence != null && (r.confidence < 0 || r.confidence > 1)) {
      rejected.push({ reason: "confidence_out_of_range", statement });
      continue;
    }

    const asOf = isoOrNull(r.asOf);
    const validUntil = isoOrNull(r.validUntil);
    // A window that closes before it opens is not a window. This is not a DDL
    // constraint (the columns are independent) so it can only be caught here.
    if (asOf && validUntil && Date.parse(validUntil) <= Date.parse(asOf)) {
      rejected.push({ reason: "validity_window_inverted", statement });
      continue;
    }

    accepted.push({
      kind: r.kind,
      subject: (r.subject ?? "").trim() || null,
      statement,
      assertedBy: (r.assertedBy ?? "").trim() || null,
      asOf,
      validUntil,
      confidence: r.confidence ?? null,
      span: {
        documentId: source.documentId,
        documentVersion: source.documentVersion,
        startOffset: r.startOffset,
        endOffset: r.endOffset,
        // Sliced from the text the extractor read, not re-derived later: after a
        // rebuild the offsets may not resolve, and a citation that cannot show
        // what it quoted is not a citation.
        excerpt: text.slice(r.startOffset, r.endOffset),
      },
      // Deduplicated and trimmed here so the store never sees the same entity
      // twice for one assertion - the mention key would reject the second.
      mentions: [...new Set((r.mentions ?? []).map((m) => m.trim()).filter(Boolean))],
    });
  }

  return { accepted, rejected };
}

/**
 * Conflict CANDIDATES within one batch: same subject, different statement.
 *
 * Deliberately not a similarity score. A conflict is two versions of the same
 * assertion, and "same assertion" is decided by subject - which is why
 * `assertion.subject` exists and is indexed. A similarity threshold would make
 * the steward's adjudication queue a function of an embedding model's mood.
 *
 * This finds candidates only. Whether they actually contradict is the steward's
 * call, and the answer lands as an `evidence` row with `stance = contradicts`.
 */
// NOT CALLED IN PRODUCTION YET, deliberately: adjudication is a human act and
// its surface is deferred by 140 section 5. See 140 section 11.3 - built half,
// with the other half ruled out of this round. Do not delete as dead.
export function conflictCandidates(prepared: PreparedAssertion[]): [PreparedAssertion, PreparedAssertion][] {
  const bySubject = new Map<string, PreparedAssertion[]>();
  for (const a of prepared) {
    if (!a.subject) continue; // no subject, no claim about sameness
    const key = a.subject.toLowerCase();
    if (!bySubject.has(key)) bySubject.set(key, []);
    bySubject.get(key)!.push(a);
  }

  const pairs: [PreparedAssertion, PreparedAssertion][] = [];
  for (const group of bySubject.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        if (group[i].statement !== group[j].statement) pairs.push([group[i], group[j]]);
      }
    }
  }
  return pairs;
}
