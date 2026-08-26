import { test } from "node:test";
import assert from "node:assert/strict";
import { prepare, conflictCandidates, type RawAssertion } from "./extract";
import { isRecallable, confidenceWeight } from "./kinds";

const TEXT = "The manual states one sortie lasts 25 minutes in light rain, per the 2026 edition.";
const SOURCE = { documentId: "doc-1", documentVersion: 4, textLength: TEXT.length };

function raw(over: Partial<RawAssertion> = {}): RawAssertion {
  return {
    kind: "fact",
    subject: "sortie duration",
    statement: "one sortie lasts 25 minutes in light rain",
    assertedBy: "Ops Manual 2026 editorial board",
    startOffset: 18,
    endOffset: 58,
    confidence: 0.87,
    ...over,
  };
}

// --- admission ----------------------------------------------------------------

test("an admissible assertion carries its span, sliced from the text it was read from", () => {
  const { accepted, rejected } = prepare([raw()], SOURCE, TEXT);
  assert.equal(rejected.length, 0);
  assert.equal(accepted.length, 1);
  assert.equal(accepted[0].span.documentVersion, 4, "provenance is meaningless without the version");
  assert.equal(accepted[0].span.excerpt, TEXT.slice(18, 58));
});

test("a rejected statement does not take the batch down with it", () => {
  // An extractor run produces well over a thousand statements; losing all of
  // them because one had a bad offset is the failure this shape exists to stop.
  const { accepted, rejected } = prepare(
    [raw(), raw({ statement: "  ", subject: "x" }), raw({ subject: "other" })],
    SOURCE,
    TEXT,
  );
  assert.equal(accepted.length, 2);
  assert.deepEqual(rejected.map((r) => r.reason), ["empty_statement"]);
});

test("an unknown kind is refused rather than coerced", () => {
  const { accepted, rejected } = prepare([raw({ kind: "opinion" })], SOURCE, TEXT);
  assert.equal(accepted.length, 0);
  assert.equal(rejected[0].reason, "unknown_kind");
});

test("offsets past the end of the extractor's own input are refused", () => {
  // A model that hallucinates a range beyond its input would otherwise produce
  // a span that quotes nothing at all.
  const { rejected } = prepare([raw({ endOffset: TEXT.length + 40 })], SOURCE, TEXT);
  assert.equal(rejected[0].reason, "offsets_out_of_range");
});

test("an inverted or empty range is refused", () => {
  assert.equal(prepare([raw({ startOffset: 50, endOffset: 20 })], SOURCE, TEXT).rejected[0].reason, "offsets_inverted");
  assert.equal(prepare([raw({ startOffset: 20, endOffset: 20 })], SOURCE, TEXT).rejected[0].reason, "offsets_inverted");
});

test("confidence outside 0..1 is refused", () => {
  assert.equal(prepare([raw({ confidence: 1.4 })], SOURCE, TEXT).rejected[0].reason, "confidence_out_of_range");
  assert.equal(prepare([raw({ confidence: null })], SOURCE, TEXT).accepted[0].confidence, null);
});

test("a validity window that closes before it opens is refused", () => {
  // The two columns are independent in the DDL, so this can ONLY be caught here.
  const { rejected } = prepare(
    [raw({ asOf: "2026-08-01T00:00:00Z", validUntil: "2026-07-01T00:00:00Z" })],
    SOURCE,
    TEXT,
  );
  assert.equal(rejected[0].reason, "validity_window_inverted");
});

test("a validity window that opens and never closes is fine - undeclared is not infinite", () => {
  const { accepted } = prepare([raw({ asOf: "2026-08-01T00:00:00Z" })], SOURCE, TEXT);
  assert.equal(accepted[0].validUntil, null);
});

test("blank source attribution normalises to null, never to an empty string", () => {
  // An empty `asserted_by` would read as "attributed to nobody"; null reads as
  // "not stated", which is what it is.
  const { accepted } = prepare([raw({ assertedBy: "   " })], SOURCE, TEXT);
  assert.equal(accepted[0].assertedBy, null);
});

test("mentions are deduplicated - the mention key would reject the second", () => {
  const { accepted } = prepare([raw({ mentions: ["Bureau", " Bureau ", "", "Drone Project"] })], SOURCE, TEXT);
  assert.deepEqual(accepted[0].mentions, ["Bureau", "Drone Project"]);
});

// --- conflict candidates -------------------------------------------------------

test("conflict candidates are found by SUBJECT, not by similarity", () => {
  // A similarity threshold would make the steward's queue a function of an
  // embedding model's mood. Same subject + different statement is the whole rule.
  const { accepted } = prepare(
    [
      raw({ statement: "one sortie lasts 25 minutes" }),
      raw({ statement: "one sortie lasts 40 minutes" }),
      raw({ subject: "wind limit", statement: "no flight above 10 m/s" }),
    ],
    SOURCE,
    TEXT,
  );
  const pairs = conflictCandidates(accepted);
  assert.equal(pairs.length, 1);
  assert.deepEqual(
    pairs[0].map((p) => p.statement).sort(),
    ["one sortie lasts 25 minutes", "one sortie lasts 40 minutes"],
  );
});

test("identical statements about one subject are not a conflict", () => {
  const { accepted } = prepare([raw(), raw()], SOURCE, TEXT);
  assert.deepEqual(conflictCandidates(accepted), []);
});

test("an assertion with no subject makes no claim about sameness", () => {
  const { accepted } = prepare(
    [raw({ subject: null, statement: "a" }), raw({ subject: null, statement: "b" })],
    SOURCE,
    TEXT,
  );
  assert.deepEqual(conflictCandidates(accepted), []);
});

// --- the read-side invariant ----------------------------------------------------

test("an assertion with no evidence is NOT recallable, whatever its state", () => {
  // Proven necessary by a live probe: deleting a document cascades its spans and
  // evidence but leaves the assertion standing. A foreign key cannot express
  // "lost its LAST edge", so the filter is a read-time definition instead.
  assert.equal(isRecallable({ contentState: "indexed", evidenceCount: 0 }), false);
  assert.equal(isRecallable({ contentState: "indexed", evidenceCount: 1 }), true);
});

test("an assertion that lost a conflict is not recallable", () => {
  assert.equal(
    isRecallable({ contentState: "indexed", evidenceCount: 2, supersededById: "other" }),
    false,
  );
});

test("only indexed assertions are recallable", () => {
  for (const s of ["draft", "processing", "failed", "archived", "deleted"]) {
    assert.equal(isRecallable({ contentState: s, evidenceCount: 3 }), false, s);
  }
});

// --- KD-210 ---------------------------------------------------------------------

test("confidence stops ranking once a person has confirmed the assertion", () => {
  assert.equal(confidenceWeight({ verificationState: "unverified", confidence: 0.8 }), 0.8);
  assert.equal(confidenceWeight({ verificationState: "stale", confidence: 0.8 }), 0.8);
  assert.equal(
    confidenceWeight({ verificationState: "verified", confidence: 0.8 }),
    null,
    "after confirmation `verified` is the stronger signal; a model score would dilute it",
  );
});
