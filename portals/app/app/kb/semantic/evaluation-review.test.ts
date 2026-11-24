import { runInNewContext } from "node:vm";
import { validateReviewReceipts } from "./review-receipts.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createReviewSheet, inspectReviewSheet, renderReviewMarkdown } from "./evaluation-review";
import { corpusFingerprint, type DraftDataset, type EvaluationCorpus } from "./evaluation";

function fixture() {
  const text = "Article one: budget is public.\nArticle two: secret reserved phrase.";
  const second = text.indexOf("Article two");
  const corpus: EvaluationCorpus = { formatVersion: 1, dataClass: "test_fixture", sources: [{
    id: "source", title: "Example", url: "https://example.org/source", edition: "fixed", text,
    canonicalSha256: createHash("sha256").update(text).digest("hex"), sections: [
      { id: "one", label: "Article one", start: 0, end: second - 1 },
      { id: "two", label: "Article two", start: second, end: text.length },
    ],
  }] };
  const dataset: DraftDataset = { formatVersion: 1, reviewStatus: "agent_draft", corpusSha256: corpusFingerprint(corpus), cases: [
    { id: "dev", split: "development", kind: "single", question: "Is budget public?", expectedAnswer: "Yes",
      evidence: [{ sourceId: "source", sectionId: "one" }] },
    { id: "reserved-id", split: "reserved", kind: "single", question: "reserved question", expectedAnswer: "reserved answer",
      evidence: [{ sourceId: "source", sectionId: "two" }] },
  ] };
  return { corpus, dataset };
}

test("review export contains exact cited passages and only development cases", () => {
  const { corpus, dataset } = fixture(), sheet = createReviewSheet(corpus, dataset);
  assert.deepEqual(sheet.entries.map(e => e.caseId), ["dev"]);
  assert.equal(sheet.entries[0].decision, "pending");
  const markdown = renderReviewMarkdown(corpus, dataset);
  assert.ok(markdown.includes(corpus.sources[0].text.slice(0, corpus.sources[0].sections[0].end)));
  for (const secret of ["reserved-id", "reserved question", "reserved answer", "secret reserved phrase"]) {
    assert.equal(markdown.includes(secret), false);
    assert.equal(JSON.stringify(sheet).includes(secret), false);
  }
  assert.equal(inspectReviewSheet(corpus, dataset, sheet).counts.pending, 1);
});

test("changed answers, questions, evidence, split or source version invalidate existing receipts", () => {
  for (const patch of [
    { expectedAnswer: "changed" }, { question: "changed" }, { split: "reserved" as const },
    { evidence: [] },
  ]) {
    const { corpus, dataset } = fixture(), sheet = createReviewSheet(corpus, dataset);
    Object.assign(dataset.cases[0], patch);
    assert.throws(() => inspectReviewSheet(corpus, dataset, sheet));
  }
  const { corpus, dataset } = fixture(), sheet = createReviewSheet(corpus, dataset);
  corpus.sources[0].edition = "new"; dataset.corpusSha256 = corpusFingerprint(corpus);
  assert.throws(() => inspectReviewSheet(corpus, dataset, sheet), /review_binding_mismatch/);
});

test("duplicate, omitted, unknown and reserved review entries cannot count as completed", () => {
  for (const mutate of [
    (sheet: ReturnType<typeof createReviewSheet>) => { sheet.entries = []; },
    (sheet: ReturnType<typeof createReviewSheet>) => { sheet.entries.push(sheet.entries[0]); },
    (sheet: ReturnType<typeof createReviewSheet>) => { sheet.entries[0].caseId = "reserved-id"; },
    (sheet: ReturnType<typeof createReviewSheet>) => { sheet.entries[0].caseSha256 = "wrong"; },
  ]) {
    const { corpus, dataset } = fixture(), sheet = createReviewSheet(corpus, dataset);
    mutate(sheet); assert.throws(() => inspectReviewSheet(corpus, dataset, sheet));
  }
});

test("review decisions require attributed timestamp and rationale but never grant gold status", () => {
  const { corpus, dataset } = fixture(), sheet = createReviewSheet(corpus, dataset);
  const entry = sheet.entries[0]; entry.decision = "accept";
  assert.throws(() => inspectReviewSheet(corpus, dataset, sheet), /review_receipt_required/);
  entry.reviewer = "test-only reviewer"; entry.reviewedAt = "2026-11-24T00:00:00.000Z"; entry.note = "Test receipt only";
  const result = inspectReviewSheet(corpus, dataset, sheet);
  assert.equal(result.structurallyComplete, true);
  assert.equal(result.acceptedGold, false); assert.equal(result.humanIdentityVerified, false);
  entry.decision = "revise";
  assert.equal(inspectReviewSheet(corpus, dataset, sheet).structurallyComplete, false);
  entry.decision = "reject";
  assert.equal(inspectReviewSheet(corpus, dataset, sheet).counts.reject, 1);
  entry.decision = "pending";
  assert.throws(() => inspectReviewSheet(corpus, dataset, sheet), /invalid_pending_review/);
});

test("invalid dates and whitespace reviewer names cannot form receipts", () => {
  const { corpus, dataset } = fixture(), sheet = createReviewSheet(corpus, dataset), entry = sheet.entries[0];
  Object.assign(entry, { decision: "accept", reviewer: "someone", reviewedAt: "2026-02-30T00:00:00.000Z", note: "checked" });
  assert.throws(() => inspectReviewSheet(corpus, dataset, sheet), /review_receipt_required/);
  entry.reviewedAt = "2026-11-24T00:00:00.000Z"; entry.reviewer = " ";
  assert.throws(() => inspectReviewSheet(corpus, dataset, sheet), /review_receipt_required/);
});

test("source markup and fence injection remain literal in the generated review artifact", () => {
  const { corpus, dataset } = fixture();
  dataset.cases[0].question = "```\n<script>not an instruction</script>\n````";
  const markdown = renderReviewMarkdown(corpus, dataset);
  assert.ok(markdown.includes("`````text\n" + dataset.cases[0].question + "\n`````"));
});

test("checked-in review pack exports 45 pending cases without any reserved prompt", () => {
  const corpus = JSON.parse(readFileSync("../../scripts/knowledge/corpus/procurement-regulations-2015.json", "utf8")) as EvaluationCorpus;
  const dataset = JSON.parse(readFileSync("../../scripts/knowledge/corpus/procurement-draft-cases.json", "utf8")) as DraftDataset;
  const sheet = createReviewSheet(corpus, dataset), markdown = renderReviewMarkdown(corpus, dataset);
  assert.equal(sheet.entries.length, 45);
  assert.equal(inspectReviewSheet(corpus, dataset, sheet).counts.pending, 45);
  for (const item of dataset.cases.filter(c => c.split === "reserved")) assert.equal(markdown.includes(item.question), false);
});


test("browser and server reject malformed or self-promoted receipts identically", () => {
  const { corpus, dataset } = fixture(), expected = createReviewSheet(corpus, dataset);
  const source = readFileSync(new URL("./review-receipts.js", import.meta.url), "utf8").replace(/^export /gm, "");
  const browser = runInNewContext(source + ";validateReviewReceipts");
  const valid = structuredClone(expected);
  Object.assign(valid.entries[0], { decision: "accept", reviewer: "Synthetic test reviewer", reviewedAt: "2026-11-24T12:00:00.000Z", note: "Synthetic structural test only" });
  assert.deepEqual(JSON.parse(JSON.stringify(browser(expected, valid))), validateReviewReceipts(expected, valid));
  const mutations = [
    (s: any) => { s.acceptedGold = true; },
    (s: any) => { s.entries[0].authenticated = true; },
    (s: any) => { s.entries[0].reviewer = " "; },
    (s: any) => { s.entries[0].note = " "; },
    (s: any) => { s.entries[0].reviewedAt = "2026-02-30T12:00:00.000Z"; },
    (s: any) => { s.entries[0].note = "x".repeat(10001); },
    (s: any) => { s.entries[0].decision = "pending"; },
    (s: any) => { s.entries[0].caseId = "reserved-id"; },
    (s: any) => { s.entries.push(s.entries[0]); },
    (s: any) => { delete s.entries[0].note; },
    (s: any) => { s.datasetSha256 = "old-version"; },
  ];
  for (const mutate of mutations) {
    const bad = structuredClone(valid); mutate(bad);
    assert.throws(() => validateReviewReceipts(expected, bad));
    assert.throws(() => browser(expected, bad));
  }
  assert.equal(inspectReviewSheet(corpus, dataset, valid).acceptedGold, false);
});
