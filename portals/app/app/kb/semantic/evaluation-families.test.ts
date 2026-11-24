import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { corpusFingerprint, type DraftDataset } from "./evaluation";
import { evaluateFamilyDevelopment, familyCorpusFingerprint, selectFamilyDevelopment, validateFamilySplit,
  type FamilySplitPlan, type NoticeCorpus } from "./evaluation-families";
import { createReviewSheet, renderReviewMarkdown } from "./evaluation-review";

function fixture() {
  const root = "../../scripts/knowledge/corpus/";
  const read = <T>(file: string): T => JSON.parse(readFileSync(root + file, "utf8")) as T;
  return { corpus: read<NoticeCorpus>("procurement-notices-20261124.json"),
    plan: read<FamilySplitPlan>("procurement-project-split.json"), dataset: read<DraftDataset>("procurement-project-draft-cases.json") };
}

test("real project split keeps one entire project out of development index and review exports", () => {
  const { corpus, plan, dataset } = fixture();
  const report = evaluateFamilyDevelopment(corpus, plan, dataset);
  assert.equal(report.acceptedGold, false);
  assert.equal(report.developmentProjectFamilies, 2); assert.equal(report.reservedProjectFamilies, 1);
  assert.equal(report.reservedSourcesNotIndexed, 1);
  assert.equal(report.cases.length, 12);
  assert.equal(report.metrics.answerableCases, 10);
  for (const item of report.cases) assert.equal(item.retrieved.some(id => id.includes("satellite-tender")), false);
  const selected = selectFamilyDevelopment(corpus, plan, dataset);
  const markdown = renderReviewMarkdown(selected.corpus, selected.dataset);
  assert.equal(markdown.includes(corpus.sources[2].title), false);
  assert.equal(createReviewSheet(selected.corpus, selected.dataset).entries.every(e => e.decision === "pending"), true);
});

test("omitted, duplicated, unknown or mismatched source assignments fail closed", () => {
  for (const mutate of [
    (p: FamilySplitPlan) => { p.families.pop(); },
    (p: FamilySplitPlan) => { p.families[0].sourceIds.push(p.families[0].sourceIds[0]); },
    (p: FamilySplitPlan) => { p.families[0].sourceIds = ["missing"]; },
    (p: FamilySplitPlan) => { p.families[0].projectNumber = "different"; },
    (p: FamilySplitPlan) => { p.families[0].sourceIds = p.families[1].sourceIds; },
  ]) {
    const { corpus, plan } = fixture(); mutate(plan);
    assert.throws(() => validateFamilySplit(corpus, plan));
  }
});

test("same family or project number cannot be partitioned under different family labels", () => {
  for (const field of ["familyId", "projectNumber"] as const) {
    const { corpus, plan } = fixture(); plan.families[2][field] = plan.families[0][field];
    assert.throws(() => validateFamilySplit(corpus, plan), /invalid_project_family/);
  }
});

test("source family or acquisition metadata changes invalidate the pinned plan", () => {
  for (const field of ["projectFamilyId", "projectNumber", "publishedOn", "savedHtmlSha256"] as const) {
    const { corpus, plan } = fixture(); corpus.sources[0][field] = "changed";
    assert.throws(() => validateFamilySplit(corpus, plan), /family_plan_binding_mismatch/);
  }
});

test("source renaming cannot smuggle the same URL or snapshot into reserved material", () => {
  for (const field of ["url", "savedHtmlSha256"] as const) {
    const { corpus, plan } = fixture(); corpus.sources[2][field] = corpus.sources[0][field];
    plan.familyCorpusSha256 = familyCorpusFingerprint(corpus);
    assert.throws(() => validateFamilySplit(corpus, plan), /cross_family_source_overlap/);
  }
});

test("relabeling a current case as reserved or citing a reserved source is refused", () => {
  const { corpus, plan, dataset } = fixture(); dataset.cases = [dataset.cases[0]]; dataset.cases[0].split = "reserved";
  assert.throws(() => evaluateFamilyDevelopment(corpus, plan, dataset), /reserved_project_case_refused/);
  dataset.cases[0].split = "development";
  dataset.cases[0].evidence = [{ sourceId: corpus.sources[2].id, sectionId: corpus.sources[2].sections[0].id }];
  assert.throws(() => evaluateFamilyDevelopment(corpus, plan, dataset), /reserved_project_case_refused/);
});

test("changing canonical text or anchors cannot be accepted by merely rebinding a plan", () => {
  const { corpus, plan } = fixture(); corpus.sources[0].sections[0].end--;
  plan.familyCorpusSha256 = familyCorpusFingerprint(corpus);
  assert.throws(() => validateFamilySplit(corpus, plan), /family_source_reconstruction_mismatch/);
});

test("a correction added to a development family must stay with that family", () => {
  const { corpus, plan, dataset } = fixture();
  const added = structuredClone(corpus.sources[0]); added.id = "same-project-another-notice";
  corpus.sources.push(added); plan.families[0].sourceIds.push(added.id);
  plan.familyCorpusSha256 = familyCorpusFingerprint(corpus); dataset.corpusSha256 = corpusFingerprint(corpus);
  assert.equal(validateFamilySplit(corpus, plan).has(added.id), true);
  plan.families[0].sourceIds.pop(); plan.families[2].sourceIds.push(added.id);
  assert.throws(() => validateFamilySplit(corpus, plan), /family_source_assignment_mismatch/);
});

test("a plan cannot self-upgrade to reviewed or eliminate the reserved family", () => {
  const { corpus, plan } = fixture();
  assert.throws(() => validateFamilySplit(corpus, { ...plan, status: "reviewed" as FamilySplitPlan["status"] }), /family_plan_binding_mismatch/);
  plan.families[2].split = "development";
  assert.throws(() => validateFamilySplit(corpus, plan), /incomplete_family_partition/);
});
