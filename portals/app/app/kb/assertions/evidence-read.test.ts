import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeEvidence, evidenceNotFound, type GroundedAssertionRow } from "./evidence-read";
import type { ChunkRange } from "./overlap";

const chunk = (over: Partial<ChunkRange> = {}): ChunkRange => ({
  chunkId: "c1",
  documentId: "doc-1",
  documentVersion: 4,
  startOffset: 100,
  endOffset: 300,
  ...over,
});

const row = (over: Partial<GroundedAssertionRow> = {}): GroundedAssertionRow => ({
  assertionId: "a1",
  kind: "fact",
  subject: "sortie duration",
  statement: "one sortie lasts 25 minutes in light rain",
  assertedBy: "Ops Manual 2026 editorial board",
  asOf: "2026-01-01T00:00:00.000Z",
  validUntil: null,
  verificationState: "unverified",
  supersededById: null,
  span: {
    spanId: "s1",
    documentId: "doc-1",
    documentVersion: 4,
    startOffset: 150,
    endOffset: 190,
    excerpt: "one sortie lasts 25 minutes",
  },
  sourceDocumentVerification: "verified",
  ...over,
});

// --- the three questions ---------------------------------------------------------

test("a citation resolves to who said it, when, and from which version", () => {
  const r = shapeEvidence(chunk(), [row()]);
  assert.equal(r.status, "ok");
  assert.equal(r.assertions.length, 1);
  const a = r.assertions[0];
  assert.equal(a.assertedBy, "Ops Manual 2026 editorial board");
  assert.equal(a.asOf, "2026-01-01T00:00:00.000Z");
  assert.equal(a.documentVersion, 4);
  assert.equal(a.excerpt, "one sortie lasts 25 minutes");
});

test("an unstated source is reported as null, not hidden", () => {
  // "The source did not say who" is a fact an agent weighing trust needs.
  const r = shapeEvidence(chunk(), [row({ assertedBy: null })]);
  assert.equal(r.assertions[0].assertedBy, null);
});

test("the source document's verification travels as a SIGNAL, read fresh", () => {
  // KD-209: consultable, never inherited. It is not the assertion's own state -
  // which stays whatever a person made it.
  const r = shapeEvidence(chunk(), [row({ verificationState: "unverified", sourceDocumentVerification: "verified" })]);
  assert.equal(r.assertions[0].verificationState, "unverified");
  assert.equal(r.assertions[0].sourceDocumentVerification, "verified");
});

// --- the join -----------------------------------------------------------------

test("only assertions whose grounds overlap the citation come back", () => {
  const r = shapeEvidence(chunk(), [
    row({ assertionId: "inside" }),
    row({ assertionId: "elsewhere", span: { ...row().span, spanId: "s2", startOffset: 900, endOffset: 950 } }),
  ]);
  assert.deepEqual(r.assertions.map((a) => a.assertionId), ["inside"]);
});

test("assertions are ordered by position in the document, not by quality", () => {
  // A provenance answer is a reading of a passage. Reordering it by confidence
  // or verification would quietly editorialise what the source says.
  const r = shapeEvidence(chunk(), [
    row({ assertionId: "late", verificationState: "verified", span: { ...row().span, spanId: "s2", startOffset: 250, endOffset: 280 } }),
    row({ assertionId: "early", verificationState: "unverified" }),
  ]);
  assert.deepEqual(r.assertions.map((a) => a.assertionId), ["early", "late"]);
});

test("an adjudication loser reports what replaced it", () => {
  // An agent that cited the old value has to be able to find out what happened.
  const r = shapeEvidence(chunk(), [row({ supersededById: "winner-id" })]);
  assert.equal(r.assertions[0].supersededBy, "winner-id");
});

// --- the statuses that must stay distinct ----------------------------------------

test("a citation predating source ranges says so - it does not say 'nothing'", () => {
  // "This citation cannot be traced" and "nothing was extracted here" are
  // different facts about the corpus, and a caller deciding whether to trust an
  // answer needs to tell them apart.
  const r = shapeEvidence(chunk({ startOffset: null, endOffset: null }), [row()]);
  assert.equal(r.status, "no_source_range");
  assert.deepEqual(r.assertions, []);
});

test("a traceable citation with nothing extracted says exactly that", () => {
  const r = shapeEvidence(chunk(), []);
  assert.equal(r.status, "no_assertions");
});

test("not-visible and not-found answer IDENTICALLY", () => {
  // Otherwise the tool is an oracle: one call per guess tells a caller which
  // chunk ids exist inside libraries it has no access to.
  const denied = evidenceNotFound("c-someone-elses");
  const missing = evidenceNotFound("c-does-not-exist");
  assert.deepEqual({ ...denied, citationId: "" }, { ...missing, citationId: "" });
  assert.equal(denied.status, "no_assertions");
  assert.equal(denied.documentId, null, "not even the document may leak");
});
