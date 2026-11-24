// Usage: tsx scripts/knowledge/project-review.ts export <new-directory>
//        tsx scripts/knowledge/project-review.ts check <review-json>
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectFamilyDevelopment, type FamilySplitPlan, type NoticeCorpus } from "../../portals/app/app/kb/semantic/evaluation-families";
import { createReviewSheet, inspectReviewSheet, renderReviewMarkdown, type ReviewSheet } from "../../portals/app/app/kb/semantic/evaluation-review";
import type { DraftDataset } from "../../portals/app/app/kb/semantic/evaluation";

const args = process.argv.slice(2);
if (args.length !== 2 || !["export", "check"].includes(args[0])) throw new Error("usage: project-review.ts export|check path");
const root = resolve(import.meta.dirname, "corpus");
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(root, file), "utf8")) as T;
const selected = selectFamilyDevelopment(read<NoticeCorpus>("procurement-notices-20261124.json"),
  read<FamilySplitPlan>("procurement-project-split.json"), read<DraftDataset>("procurement-project-draft-cases.json"));
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
