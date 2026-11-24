// Usage: tsx scripts/knowledge/project-review.ts export <new-directory>
//        tsx scripts/knowledge/project-review.ts check <review-json>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectFamilyDevelopment, type FamilySplitPlan, type ProjectCorpus } from "../../portals/app/app/kb/semantic/evaluation-families";
import { createReviewSheet, inspectReviewSheet, renderReviewMarkdown, selectReviewAdditions, type ReviewSheet } from "../../portals/app/app/kb/semantic/evaluation-review";
import type { DraftDataset } from "../../portals/app/app/kb/semantic/evaluation";

const args = process.argv.slice(2);
if (![2, 3].includes(args.length) || !["export", "check"].includes(args[0]) ||
    (args.length === 3 && !["--materials", "--history", "--history-additions"].includes(args[2]))) throw new Error("usage: project-review.ts export|check path [--materials|--history|--history-additions]");
const materials = args[2] === "--materials";
const history = ["--history", "--history-additions"].includes(args[2]);
const root = resolve(import.meta.dirname, "corpus");
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(root, file), "utf8")) as T;
let selected = selectFamilyDevelopment(read<ProjectCorpus>(history ? "procurement-project-history-20261124.json" : materials ? "procurement-project-materials-20261124.json" : "procurement-notices-20261124.json"),
  read<FamilySplitPlan>(history ? "procurement-history-split.json" : materials ? "procurement-materials-split.json" : "procurement-project-split.json"),
  read<DraftDataset>(history ? "procurement-history-draft-cases.json" : materials ? "procurement-materials-draft-cases.json" : "procurement-project-draft-cases.json"));
if (args[2] === "--history-additions") {
  const previous = selectFamilyDevelopment(read<ProjectCorpus>("procurement-project-materials-20261124.json"),
    read<FamilySplitPlan>("procurement-materials-split.json"), read<DraftDataset>("procurement-materials-draft-cases.json"));
  selected = selectReviewAdditions(previous, selected);
}
if (args[0] === "export") {
  const sheet = createReviewSheet(selected.corpus, selected.dataset), markdown = renderReviewMarkdown(selected.corpus, selected.dataset);
  const output = resolve(args[1]); mkdirSync(output);
  writeFileSync(resolve(output, "review.json"), JSON.stringify(sheet, null, 2) + "\n", { flag: "wx" });
  writeFileSync(resolve(output, "review.md"), markdown, { flag: "wx" });
  console.log(JSON.stringify({ output, pending: sheet.entries.length, reservedSourcesExported: 0, acceptedGold: false }));
} else {
  const sheet = JSON.parse(readFileSync(resolve(args[1]), "utf8")) as ReviewSheet;
  console.log(JSON.stringify(inspectReviewSheet(selected.corpus, selected.dataset, sheet), null, 2));
}
