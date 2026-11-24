// Export development-only review artifacts to a NEW directory; never overwrite.
// Usage: tsx scripts/knowledge/export-review.ts <new-output-directory>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createReviewSheet, renderReviewMarkdown } from "../../portals/app/app/kb/semantic/evaluation-review";
import type { DraftDataset, EvaluationCorpus } from "../../portals/app/app/kb/semantic/evaluation";

const args = process.argv.slice(2);
if (args.length !== 1) throw new Error("usage: export-review.ts new-output-directory");
const root = resolve(import.meta.dirname, "corpus"), output = resolve(args[0]);
const corpus = JSON.parse(readFileSync(resolve(root, "procurement-regulations-2015.json"), "utf8")) as EvaluationCorpus;
const dataset = JSON.parse(readFileSync(resolve(root, "procurement-draft-cases.json"), "utf8")) as DraftDataset;
const sheet = createReviewSheet(corpus, dataset), markdown = renderReviewMarkdown(corpus, dataset);
mkdirSync(output); // Existing directories fail; reviewer edits can never be overwritten.
writeFileSync(resolve(output, "review.json"), JSON.stringify(sheet, null, 2) + "\n", { flag: "wx" });
writeFileSync(resolve(output, "review.md"), markdown, { flag: "wx" });
console.log(JSON.stringify({ output, developmentCases: sheet.entries.length, reservedCasesExported: 0, acceptedGold: false }));
