import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";
import { reconstructLocalPdf } from "./pdf-corpus";
import { validatePdfNavigation, type PdfNavigationPlan } from "./pdf-navigation";
import { corpusFingerprint, type DraftDataset } from "./evaluation";
import { createReviewSheet } from "./evaluation-review";

const sha = (text: string) => createHash("sha256").update(text).digest("hex");
function fixture() {
  const source = reconstructLocalPdf({ id: "source", title: "Synthetic tender", projectNumber: "PROJECT-TEST", formatVersion: 1,
    binarySha256: "a".repeat(64), extractor: { name: "pypdf", version: "6.21.4" },
    pages: ["PROJECT-TEST cover", "Chapter one\nBudget", "Evidence"].map((text, i) => ({ page: i + 1, text, textSha256: sha(text) })) });
  const plan: PdfNavigationPlan = { formatVersion: 1, binarySha256: source.binarySha256, groups: [
    { id: "cover", label: "PDF pages 1-1", startPage: 1, endPage: 1, kind: "page_range" },
    { id: "one", label: "Chapter one", startPage: 2, endPage: 3, kind: "heading" },
  ] };
  return { source, plan };
}

test("chapter navigation binds the exact PDF and covers each physical page once", () => {
  const { source, plan } = fixture();
  validatePdfNavigation(source, plan);
  const corpus = { formatVersion: 1, dataClass: "owner_supplied_local_pdf_snapshot", sources: [source] };
  const dataset: DraftDataset = { formatVersion: 1, reviewStatus: "agent_draft", corpusSha256: corpusFingerprint(corpus), cases: [
    { id: "dev", split: "development", kind: "single", question: "Budget?", expectedAnswer: "Verify", evidence: [{ sourceId: source.id, sectionId: "page-2" }] },
  ] };
  const original = createReviewSheet(corpus, dataset);
  plan.groups[1].label = "Chapter   one";
  validatePdfNavigation(source, plan);
  assert.deepEqual(createReviewSheet(corpus, dataset), original);
});

test("navigation refuses gaps, overlap, missing pages, duplicate IDs and invented headings", () => {
  for (const mutate of [
    (p: PdfNavigationPlan) => { p.binarySha256 = "b".repeat(64); },
    (p: PdfNavigationPlan) => { p.groups[1].startPage = 3; },
    (p: PdfNavigationPlan) => { p.groups[1].startPage = 1; },
    (p: PdfNavigationPlan) => { p.groups[1].endPage = 2; },
    (p: PdfNavigationPlan) => { p.groups[1].endPage = 4; },
    (p: PdfNavigationPlan) => { p.groups[1].id = "cover"; },
    (p: PdfNavigationPlan) => { p.groups[1].label = "Invented requirement"; },
    (p: PdfNavigationPlan) => { p.groups[1].label = "Evidence"; },
    (p: PdfNavigationPlan) => { p.groups[0].label = "Authenticated cover"; },
  ]) {
    const { source, plan } = fixture(); mutate(plan);
    assert.throws(() => validatePdfNavigation(source, plan));
  }
});

test("actual local canvas export preserves receipt binding and binary while excluding local paths", () => {
  const directory = mkdtempSync(resolve(tmpdir(), "karda-pdf-canvas-"));
  try {
    const root = resolve("../../scripts/knowledge"), python = process.env.KARDA_KNOWLEDGE_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
    const pdf = resolve(directory, "owner-original.pdf"), metadata = resolve(directory, "metadata.json"), imported = resolve(directory, "imported");
    execFileSync(python, ["-c", "import sys;from pathlib import Path;sys.path.insert(0,sys.argv[1]);from test_extract_pdf import synthetic_pdf;Path(sys.argv[2]).write_bytes(synthetic_pdf(['PROJECT-TEST cover','Chapter one Budget','Evidence']))", root, pdf]);
    writeFileSync(metadata, JSON.stringify({ id: "source", title: "Synthetic </script> tender", projectNumber: "PROJECT-TEST" }));
    const run = (...args: string[]) => execFileSync(process.execPath, ["--import", "tsx", ...args], { encoding: "utf8", stdio: "pipe" });
    run(resolve(root, "import-local-pdf.ts"), pdf, metadata, imported);
    const corpusPath = resolve(imported, "source.json"), corpus = JSON.parse(readFileSync(corpusPath, "utf8"));
    const dataset: DraftDataset = { formatVersion: 1, reviewStatus: "agent_draft", corpusSha256: corpusFingerprint(corpus), cases: [
      { id: "dev", split: "development", kind: "single", question: "Budget?", expectedAnswer: "Verify", evidence: [{ sourceId: "source", sectionId: "page-2" }] },
    ] };
    const plan = { ...fixture().plan, binarySha256: corpus.sources[0].binarySha256 };
    const casesPath = resolve(directory, "cases.json"), planPath = resolve(directory, "navigation.json"), output = resolve(directory, "canvas");
    writeFileSync(casesPath, JSON.stringify(dataset)); writeFileSync(planPath, JSON.stringify(plan));
    const args = [resolve(root, "export-local-pdf-review.ts"), corpusPath, casesPath, planPath, pdf, output];
    run(...args);
    const html = readFileSync(resolve(output, "index.html"), "utf8"), script = html.match(/<script>([\s\S]*)<\/script>/)![1];
    const data = JSON.parse(script.slice("const DATA=".length, script.indexOf(";\n")));
    assert.deepEqual(data.reviewSheet, createReviewSheet(corpus, dataset));
    assert.equal(data.sources[0].sections[1].page, 2);
    assert.equal(data.sources[0].sections[1].groupId, "one");
    assert.equal(data.sources[0].localPdfFile, "source.pdf");
    assert(readFileSync(resolve(output, "source.pdf")).equals(readFileSync(pdf)));
    assert.equal(html.includes(directory), false); assert.equal(html.includes("owner-original.pdf"), false);
    assert.equal((html.match(/<script>/g) ?? []).length, 1);
    assert(html.includes("sha256-" + createHash("sha256").update(script).digest("base64")));
    assert.throws(() => run(...args));
    assert.throws(() => run(...args.slice(0, -1), resolve(root, "forbidden-canvas")), /outside_repository/);
    writeFileSync(pdf, "changed");
    assert.throws(() => run(...args.slice(0, -1), resolve(directory, "changed")), /pdf_snapshot_mismatch/);
    dataset.cases[0].split = "reserved"; writeFileSync(casesPath, JSON.stringify(dataset));
    assert.throws(() => run(...args.slice(0, -1), resolve(directory, "reserved")), /development_pdf_only/);
  } finally {
    assert.equal(dirname(directory), resolve(tmpdir())); assert(basename(directory).startsWith("karda-pdf-canvas-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
