import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corpusFingerprint, type DraftDataset } from "./evaluation";
import { evaluateFamilyDevelopment, selectFamilyDevelopment, validateFamilySplit, type FamilySplitPlan, type ProjectCorpus } from "./evaluation-families";
import { createReviewSheet, inspectReviewSheet, selectReviewAdditions } from "./evaluation-review";

function fixture() {
  const read = <T>(name: string): T => JSON.parse(readFileSync("../../scripts/knowledge/corpus/" + name, "utf8"));
  const corpus = read<ProjectCorpus>("procurement-project-history-20261124.json"), plan = read<FamilySplitPlan>("procurement-history-split.json"),
    dataset = read<DraftDataset>("procurement-history-draft-cases.json");
  const previous = selectFamilyDevelopment(read<ProjectCorpus>("procurement-project-materials-20261124.json"),
    read<FamilySplitPlan>("procurement-materials-split.json"), read<DraftDataset>("procurement-materials-draft-cases.json"));
  return { corpus, plan, dataset, previous, current: selectFamilyDevelopment(corpus, plan, dataset) };
}

test("original tender and correction stay in one family; 20 cross-document drafts are still unreviewed", () => {
  const { corpus, plan, dataset } = fixture();
  assert.equal(corpus.sources.length, 6); assert.equal(corpus.sources.reduce((n, s) => n + s.sections.length, 0), 24);
  const report = evaluateFamilyDevelopment(corpus, plan, dataset);
  assert.equal(report.crossDocumentCases, 20); assert.equal(report.acceptedGold, false);
  assert.equal(report.reservedSourcesNotIndexed, 1);
  assert.deepEqual(report, JSON.parse(readFileSync("../../docs/70-workplan/160-history-lexical-draft-report-20261124.json", "utf8")));
  plan.families[0].sourceIds.pop(); plan.families[2].sourceIds.push("juno-tender-20261103");
  assert.throws(() => validateFamilySplit(corpus, plan), /family_source_assignment_mismatch/);
});

test("additions export contains eight pending cases and preserves the original review binding", () => {
  const { previous, current } = fixture(); const oldSheet = createReviewSheet(previous.corpus, previous.dataset);
  const additions = selectReviewAdditions(previous, current), sheet = createReviewSheet(additions.corpus, additions.dataset);
  assert.deepEqual(additions.dataset.cases.map(c => c.id), ["h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8"]);
  assert.equal(sheet.entries.every(e => e.decision === "pending"), true);
  assert.equal(inspectReviewSheet(previous.corpus, previous.dataset, oldSheet).counts.pending, 24);
  assert.throws(() => inspectReviewSheet(current.corpus, current.dataset, oldSheet), /review_binding_mismatch/);
});

test("additive review refuses silent changes or removal of old cases and evidence sources", () => {
  for (const change of ["answer", "remove-case", "source", "reserved", "empty"]) {
    const { previous, current } = fixture();
    if (change === "answer") current.dataset.cases[0].expectedAnswer += " changed";
    if (change === "remove-case") current.dataset.cases.shift();
    if (change === "source") {
      current.corpus.sources[0].edition += " changed"; current.dataset.corpusSha256 = corpusFingerprint(current.corpus);
    }
    if (change === "reserved") { current.dataset.cases = [current.dataset.cases[0]]; current.dataset.cases[0].split = "reserved"; }
    if (change === "empty") current.dataset = { ...current.dataset, cases: previous.dataset.cases };
    assert.throws(() => selectReviewAdditions(previous, current), /review_additions_/);
  }
});
