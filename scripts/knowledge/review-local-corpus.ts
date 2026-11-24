// Usage: tsx review-local-corpus.ts export|check corpus-json dataset-json new-directory|receipt-json
import { readFileSync, mkdirSync, realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { createReviewSheet, inspectReviewSheet, renderReviewMarkdown } from "../../portals/app/app/kb/semantic/evaluation-review";
import { evaluateDraftLexical, type DraftDataset, type EvaluationCorpus } from "../../portals/app/app/kb/semantic/evaluation";
import { validateLocalPdfSource, type LocalPdfSource } from "../../portals/app/app/kb/semantic/pdf-corpus";
import { writeReproducibleArtifact } from "./artifact-output";

const args = process.argv.slice(2);
if (args.length !== 4 || !["export", "check"].includes(args[0])) throw new Error("usage: review-local-corpus.ts export|check corpus-json dataset-json new-directory|receipt-json");
const read = (path: string) => JSON.parse(readFileSync(resolve(path), "utf8"));
const corpus = read(args[1]) as EvaluationCorpus, dataset = read(args[2]) as DraftDataset;
if (corpus.dataClass !== "owner_supplied_local_pdf_snapshot" || dataset.cases.some(c => c.split !== "development")) throw new Error("local_development_only");
corpus.sources.forEach(s => validateLocalPdfSource(s as LocalPdfSource));
const sheet = createReviewSheet(corpus, dataset);
if (args[0] === "check") console.log(JSON.stringify(inspectReviewSheet(corpus, dataset, read(args[3])), null, 2));
else {
  const output = resolve(args[3]), parent = realpathSync(resolve(output, "..")), repo = realpathSync(resolve(import.meta.dirname, "../.."));
  const part = relative(repo, parent);
  if (part === "" || (part !== ".." && !part.startsWith(".." + sep) && !isAbsolute(part))) throw new Error("local_review_must_stay_outside_repository");
  const report = evaluateDraftLexical(corpus, dataset);
  mkdirSync(output);
  writeReproducibleArtifact(resolve(output, "review.json"), JSON.stringify(sheet, null, 2) + "\n");
  writeReproducibleArtifact(resolve(output, "review.md"), renderReviewMarkdown(corpus, dataset));
  writeReproducibleArtifact(resolve(output, "lexical-draft-report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ output, pending: sheet.entries.length, acceptedGold: false, scope: "local_development_only" }));
}
