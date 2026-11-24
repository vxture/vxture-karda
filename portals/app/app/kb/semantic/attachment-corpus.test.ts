import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reconstructAttachment, type AttachmentSource } from "./attachment-corpus";
import { corpusFingerprint, type DraftDataset } from "./evaluation";
import { evaluateFamilyDevelopment, familyCorpusFingerprint, selectFamilyDevelopment, validateFamilySplit,
  type ProjectCorpus, type FamilySplitPlan } from "./evaluation-families";
import { createReviewSheet, inspectReviewSheet, renderReviewMarkdown } from "./evaluation-review";

const root = resolve("../../scripts/knowledge");
const python = process.platform === "win32" ? "python" : "python3";
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(root, "corpus", name), "utf8"));
function fixture() {
  return { corpus: read<ProjectCorpus>("procurement-project-materials-20261124.json"),
    plan: read<FamilySplitPlan>("procurement-materials-split.json"), dataset: read<DraftDataset>("procurement-materials-draft-cases.json") };
}
const attachment = (corpus: ProjectCorpus) => corpus.sources.find(s => s.id === "tju-qa-20261124") as AttachmentSource;

test("real DOCX bytes reproduce all retained paragraphs, XML hashes, text and UTF-16 anchors", () => {
  const { corpus } = fixture();
  for (const s of corpus.sources.filter((s): s is AttachmentSource => s.normalization === "docx-main-paragraphs-v1")) {
    const extracted = JSON.parse(execFileSync(python, [resolve(root, "extract-docx.py"), resolve(root, "corpus", s.id + ".docx")], { encoding: "utf8" }));
    assert.equal(extracted.binarySha256, s.binarySha256); assert.equal(extracted.documentXmlSha256, s.documentXmlSha256);
    assert.deepEqual(extracted.paragraphs, s.paragraphs);
    assert.deepEqual(reconstructAttachment({ ...s, paragraphs: extracted.paragraphs }), s);
  }
});

test("offline extractor rejects unsafe XML and unsupported content rather than silently dropping it", () => {
  execFileSync(python, [resolve(root, "test_extract_docx.py")], { encoding: "utf8", stdio: "pipe" });
});

test("attachment parent must be a same-project, same-date notice", () => {
  for (const parent of ["missing", "juno-correction-20261124", "tju-confirmation-20261124"]) {
    const { corpus, plan } = fixture(); attachment(corpus).parentSourceId = parent;
    plan.familyCorpusSha256 = familyCorpusFingerprint(corpus);
    assert.throws(() => validateFamilySplit(corpus, plan), /attachment_parent_mismatch/);
  }
});

test("attachment changes invalidate plans, canonical text and existing review receipts", () => {
  const { corpus, plan, dataset } = fixture();
  const selected = selectFamilyDevelopment(corpus, plan, dataset);
  const sheet = createReviewSheet(selected.corpus, selected.dataset);
  attachment(corpus).binarySha256 = "a".repeat(64);
  assert.throws(() => validateFamilySplit(corpus, plan), /family_plan_binding_mismatch/);
  plan.familyCorpusSha256 = familyCorpusFingerprint(corpus);
  assert.throws(() => validateFamilySplit(corpus, plan), /family_source_reconstruction_mismatch/);
  Object.assign(attachment(corpus), reconstructAttachment(attachment(corpus)));
  dataset.corpusSha256 = corpusFingerprint(corpus);
  plan.familyCorpusSha256 = familyCorpusFingerprint(corpus);
  const changed = selectFamilyDevelopment(corpus, plan, dataset);
  assert.throws(() => inspectReviewSheet(changed.corpus, changed.dataset, sheet), /review_binding_mismatch/);
  attachment(corpus).paragraphs[2] += " changed";
  assert.throws(() => validateFamilySplit(corpus, plan), /family_source_reconstruction_mismatch/);
  assert.equal(sheet.entries.every(e => e.decision === "pending"), true);
});

test("section omissions, repeated labels and wrong project metadata fail reconstruction", () => {
  for (const mutate of [
    (s: AttachmentSource) => { s.sectionLabels[1] = "missing"; },
    (s: AttachmentSource) => { s.sectionLabels.push(s.sectionLabels[0]); },
    (s: AttachmentSource) => { s.projectNumber = "missing-project"; },
    (s: AttachmentSource) => { s.paragraphs[0] += "\nextra"; },
  ]) {
    const { corpus } = fixture(); const s = attachment(corpus); mutate(s);
    assert.throws(() => reconstructAttachment(s));
  }
});

test("new attachments remain in the parent project partition and cannot be relabeled reserved", () => {
  const { corpus, plan, dataset } = fixture();
  plan.families[1].sourceIds = plan.families[1].sourceIds.filter(id => id !== attachment(corpus).id);
  plan.families[2].sourceIds.push(attachment(corpus).id);
  assert.throws(() => evaluateFamilyDevelopment(corpus, plan, dataset), /family_source_assignment_mismatch/);
});

test("materials report has 12 structural cross-document drafts and excludes reserved project before export", () => {
  const { corpus, plan, dataset } = fixture();
  const report = evaluateFamilyDevelopment(corpus, plan, dataset);
  assert.equal(report.crossDocumentCases, 12); assert.equal(report.cases.length, 24);
  assert.equal(report.reservedSourcesNotIndexed, 1); assert.equal(report.acceptedGold, false);
  const selected = selectFamilyDevelopment(corpus, plan, dataset);
  const md = renderReviewMarkdown(selected.corpus, selected.dataset);
  assert.equal(md.includes("CEITCL-BJ03-2609026"), false);
  assert.equal(createReviewSheet(selected.corpus, selected.dataset).entries.length, 24);
  assert.equal(dataset.corpusSha256, corpusFingerprint(corpus));
  assert.deepEqual(report, JSON.parse(readFileSync("../../docs/70-workplan/140-materials-lexical-draft-report-20261124.json", "utf8")));
});
