// Development notices only; there is no option to index/score reserved projects.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFamilyDevelopment, type FamilySplitPlan, type NoticeCorpus } from "../../portals/app/app/kb/semantic/evaluation-families";
import type { DraftDataset } from "../../portals/app/app/kb/semantic/evaluation";

if (process.argv.slice(2).length) throw new Error("project_baseline_accepts_no_flags");
const root = resolve(import.meta.dirname, "corpus");
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(root, file), "utf8")) as T;
console.log(JSON.stringify(evaluateFamilyDevelopment(
  read<NoticeCorpus>("procurement-notices-20261124.json"), read<FamilySplitPlan>("procurement-project-split.json"),
  read<DraftDataset>("procurement-project-draft-cases.json")), null, 2));
