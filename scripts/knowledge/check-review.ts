// Validate binding and structural review receipts only. Never promotes to gold.
// Usage: tsx scripts/knowledge/check-review.ts <review-json>
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { inspectReviewSheet, type ReviewSheet } from "../../portals/app/app/kb/semantic/evaluation-review";
import type { DraftDataset, EvaluationCorpus } from "../../portals/app/app/kb/semantic/evaluation";

const args = process.argv.slice(2);
if (args.length !== 1) throw new Error("usage: check-review.ts review-json");
const root = resolve(import.meta.dirname, "corpus");
const corpus = JSON.parse(readFileSync(resolve(root, "procurement-regulations-2015.json"), "utf8")) as EvaluationCorpus;
const dataset = JSON.parse(readFileSync(resolve(root, "procurement-draft-cases.json"), "utf8")) as DraftDataset;
const sheet = JSON.parse(readFileSync(resolve(args[0]), "utf8")) as ReviewSheet;
console.log(JSON.stringify(inspectReviewSheet(corpus, dataset, sheet), null, 2));
