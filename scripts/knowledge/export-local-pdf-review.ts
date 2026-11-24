// Usage: tsx export-local-pdf-review.ts source-json cases-json navigation-json saved-pdf new-directory
import { createHash } from "node:crypto";
import { closeSync, mkdirSync, openSync, readFileSync, readSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { evaluateDraftLexical, corpusFingerprint, type DraftDataset, type EvaluationCorpus } from "../../portals/app/app/kb/semantic/evaluation";
import { createReviewSheet, datasetFingerprint } from "../../portals/app/app/kb/semantic/evaluation-review";
import type { LocalPdfSource } from "../../portals/app/app/kb/semantic/pdf-corpus";
import { validatePdfNavigation, type PdfNavigationPlan } from "../../portals/app/app/kb/semantic/pdf-navigation";
import { renderOfflineReviewHtml } from "../../portals/app/app/kb/semantic/review-html";
import { writeReproducibleArtifact } from "./artifact-output";

const args = process.argv.slice(2);
if (args.length !== 5) throw new Error("usage: export-local-pdf-review.ts source-json cases-json navigation-json saved-pdf new-directory");
const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(path), "utf8"));
const corpus = read<EvaluationCorpus>(args[0]), dataset = read<DraftDataset>(args[1]), plan = read<PdfNavigationPlan>(args[2]);
if (corpus.dataClass !== "owner_supplied_local_pdf_snapshot" || corpus.sources.length !== 1 || dataset.cases.some(c => c.split !== "development")) throw new Error("single_local_development_pdf_only");
const source = corpus.sources[0] as LocalPdfSource;
validatePdfNavigation(source, plan);
const report = evaluateDraftLexical(corpus, dataset), reviewSheet = createReviewSheet(corpus, dataset);
const input = realpathSync(resolve(args[3]));
const fd = openSync(input, "r"), buffer = Buffer.alloc(20 * 1024 * 1024 + 1);
let count = 0;
try { while (count < buffer.length) { const n = readSync(fd, buffer, count, buffer.length - count, null); if (!n) break; count += n; } }
finally { closeSync(fd); }
const bytes = buffer.subarray(0, count);
if (bytes.length > 20 * 1024 * 1024 || createHash("sha256").update(bytes).digest("hex") !== source.binarySha256) throw new Error("pdf_snapshot_mismatch");
const output = resolve(args[4]), parent = realpathSync(resolve(output, "..")), repo = realpathSync(resolve(import.meta.dirname, "../.."));
const part = relative(repo, parent);
if (part === "" || (part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part))) throw new Error("local_pdf_output_must_stay_outside_repository");
const data = { mode: "local_pdf", corpusSha256: corpusFingerprint(corpus), datasetSha256: datasetFingerprint(dataset),
  cases: dataset.cases, results: report.cases, reviewSheet,
  sources: [{ id: source.id, title: source.title, url: source.url, projectFamilyId: "pdf-project:" + source.id,
    projectNumber: source.projectNumber, publishedOn: "", kind: "local_pdf", localPdfFile: "source.pdf",
    edition: source.edition, text: source.text,
    groups: plan.groups,
    sections: source.sections.map((section, i) => ({ ...section, page: i + 1,
      groupId: plan.groups.find(g => g.startPage <= i + 1 && g.endPage >= i + 1)!.id })) }] };
const html = renderOfflineReviewHtml(readFileSync(resolve(import.meta.dirname, "graph-review.html"), "utf8"),
  readFileSync(resolve(import.meta.dirname, "../../portals/app/app/kb/semantic/review-receipts.js"), "utf8").replace(/^export /gm, "") + "\n" +
  readFileSync(resolve(import.meta.dirname, "graph-review.js"), "utf8"), data);
mkdirSync(output);
writeReproducibleArtifact(resolve(output, "index.html"), html);
writeReproducibleArtifact(resolve(output, "source.pdf"), bytes);
console.log(JSON.stringify({ output, groups: plan.groups.length, pages: source.pages.length, cases: dataset.cases.length,
  acceptedGold: false, scope: "local_pdf_review_prototype" }));
