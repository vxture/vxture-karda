// Usage: tsx scripts/knowledge/project-review.ts export <new-directory>
//        tsx scripts/knowledge/project-review.ts check <review-json>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectFamilyDevelopment, type FamilySplitPlan, type ProjectCorpus } from "../../portals/app/app/kb/semantic/evaluation-families";
import { createReviewSheet, inspectReviewSheet, renderReviewMarkdown, type ReviewSheet } from "../../portals/app/app/kb/semantic/evaluation-review";
import type { DraftDataset } from "../../portals/app/app/kb/semantic/evaluation";

const args = process.argv.slice(2);
if (![2, 3].includes(args.length) || !["export", "check"].includes(args[0]) ||
    (args.length === 3 && args[2] !== "--materials")) throw new Error("usage: project-review.ts export|check path [--materials]");
const materials = args[2] === "--materials";
const root = resolve(import.meta.dirname, "corpus");
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(root, file), "utf8")) as T;
const selected = selectFamilyDevelopment(read<ProjectCorpus>(materials ? "procurement-project-materials-20261124.json" : "procurement-notices-20261124.json"),
  read<FamilySplitPlan>(materials ? "procurement-materials-split.json" : "procurement-project-split.json"),
  read<DraftDataset>(materials ? "procurement-materials-draft-cases.json" : "procurement-project-draft-cases.json"));
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
