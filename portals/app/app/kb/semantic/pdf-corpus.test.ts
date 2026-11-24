import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { reconstructLocalPdf } from "./pdf-corpus";
import { corpusFingerprint, evaluateDraftLexical, validateEvaluation, type DraftDataset } from "./evaluation";
import { createReviewSheet, inspectReviewSheet, renderReviewMarkdown } from "./evaluation-review";

const root = resolve("../../scripts/knowledge"), python = process.env.KARDA_KNOWLEDGE_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function fixture() {
  const source = reconstructLocalPdf({ id: "fixture", title: "Synthetic PDF", projectNumber: "PROJECT-TEST", formatVersion: 1,
    binarySha256: "a".repeat(64), extractor: { name: "pypdf", version: "6.21.4" },
    pages: ["PROJECT-TEST\nBudget \ud83d\ude00 42", "", "Qualification proof"].map((text, i) => ({ page: i + 1, text, textSha256: sha(text) })) });
  const corpus = { formatVersion: 1, dataClass: "owner_supplied_local_pdf_snapshot", sources: [source] };
  const dataset: DraftDataset = { formatVersion: 1, reviewStatus: "agent_draft", corpusSha256: corpusFingerprint(corpus),
    cases: [{ id: "dev", split: "development", kind: "single", question: "Budget?", expectedAnswer: "42", evidence: [{ sourceId: source.id, sectionId: "page-1" }] }] };
  return { source, corpus, dataset };
}

test("local PDF identity, physical page anchors and supplementary characters reconstruct exactly", () => {
  const { source, corpus, dataset } = fixture();
  validateEvaluation(corpus, dataset);
  assert.equal(source.url, "urn:sha256:" + source.binarySha256);
  assert.equal(source.sections.length, 3);
  assert.equal(source.text.slice(source.sections[2].start, source.sections[2].end), "PDF page 3\nQualification proof\n");
  assert.equal(source.pages[1].text, "");
  assert(renderReviewMarkdown(corpus, dataset).includes("Budget \ud83d\ude00 42"));
  const report = evaluateDraftLexical(corpus, dataset);
  assert(report.limitations.some(line => line.includes("no OCR")));
  assert.equal(report.limitations.some(line => line.includes("disjoint by article")), false);
  assert.throws(() => validateEvaluation({ ...corpus, dataClass: "public_business_notice_snapshot" }, dataset), /classification/);
});

test("page omissions, reordering, mutation and unsupported extraction versions fail closed", () => {
  for (const mutate of [
    (s: any) => { s.pages.splice(1, 1); }, (s: any) => { s.pages.reverse(); },
    (s: any) => { s.pages[0].text += " tampered"; }, (s: any) => { s.extractor.version = "other"; },
    (s: any) => { s.sections[0].end--; }, (s: any) => { s.origin = "public"; },
    (s: any) => { delete s.pages; }, (s: any) => { s.binarySha256 = "wrong"; },
    (s: any) => { s.url = "https://example.org/fake"; },
    (s: any) => { s.projectNumber = "Budget"; },
  ]) {
    const { source, corpus, dataset } = fixture(); mutate(source);
    assert.throws(() => validateEvaluation(corpus, dataset));
  }
});

test("binary snapshot changes invalidate receipts even when extracted text is unchanged", () => {
  const { source, corpus, dataset } = fixture(), sheet = createReviewSheet(corpus, dataset);
  Object.assign(source, reconstructLocalPdf({ ...source, binarySha256: "b".repeat(64) }));
  dataset.corpusSha256 = corpusFingerprint(corpus);
  assert.throws(() => inspectReviewSheet(corpus, dataset, sheet), /review_binding_mismatch/);
});

test("real Python parser rejects encryption, image-only data, limits and path replacement", () => {
  execFileSync(python, [resolve(root, "test_extract_pdf.py")], { stdio: "pipe", timeout: 30000 });
});

test("local PDF import and review round trip stay outside Git and refuse overwrite", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "karda-local-pdf-"));
  try {
    const input = resolve(directory, "input.pdf"), metadata = resolve(directory, "metadata.json"), output = resolve(directory, "imported");
    execFileSync(python, ["-c", "import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from test_extract_pdf import synthetic_pdf;Path(sys.argv[2]).write_bytes(synthetic_pdf(['PROJECT-TEST budget 42','Proof']))", root, input]);
    writeFileSync(metadata, JSON.stringify({ id: "synthetic", title: "Synthetic fixture", projectNumber: "PROJECT-TEST" }));
    const run = (...args: string[]) => execFileSync(process.execPath, ["--import", "tsx", ...args], { stdio: "pipe", encoding: "utf8" });
    run(resolve(root, "import-local-pdf.ts"), input, metadata, output);
    assert(readFileSync(resolve(output, "source.pdf")).equals(readFileSync(input)));
    const corpus = JSON.parse(readFileSync(resolve(output, "source.json"), "utf8"));
    const dataset = { ...fixture().dataset, corpusSha256: corpusFingerprint(corpus), cases: [{ ...fixture().dataset.cases[0], evidence: [{ sourceId: "synthetic", sectionId: "page-1" }] }] };
    const datasetPath = resolve(directory, "dataset.json"), review = resolve(directory, "review");
    writeFileSync(datasetPath, JSON.stringify(dataset));
    run(resolve(root, "review-local-corpus.ts"), "export", resolve(output, "source.json"), datasetPath, review);
    const checked = JSON.parse(run(resolve(root, "review-local-corpus.ts"), "check", resolve(output, "source.json"), datasetPath, resolve(review, "review.json")));
    assert.equal(checked.counts.pending, 1); assert.equal(checked.acceptedGold, false);
    assert.throws(() => run(resolve(root, "import-local-pdf.ts"), input, metadata, output));
    assert.throws(() => run(resolve(root, "review-local-corpus.ts"), "export", resolve(output, "source.json"), datasetPath, review));
    assert.throws(() => run(resolve(root, "import-local-pdf.ts"), input, metadata, resolve(root, "forbidden-private-output")), /outside_repository/);
    assert.throws(() => run(resolve(root, "review-local-corpus.ts"), "export", resolve(output, "source.json"), datasetPath, resolve(root, "forbidden-private-review")), /outside_repository/);
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir())); assert(basename(directory).startsWith("karda-local-pdf-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
