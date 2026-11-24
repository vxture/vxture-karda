// Development notices only; there is no option to index/score reserved projects.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { evaluateFamilyDevelopment, type FamilySplitPlan, type ProjectCorpus } from "../../portals/app/app/kb/semantic/evaluation-families";
import type { DraftDataset } from "../../portals/app/app/kb/semantic/evaluation";

const args = process.argv.slice(2);
if (args.length > 1 || (args.length === 1 && !["--materials", "--history"].includes(args[0]))) throw new Error("invalid_project_baseline_flags");
const materials = args[0] === "--materials";
const history = args[0] === "--history";
const root = resolve(import.meta.dirname, "corpus");
const read = <T>(file: string): T => JSON.parse(readFileSync(resolve(root, file), "utf8")) as T;
console.log(JSON.stringify(evaluateFamilyDevelopment(
  read<ProjectCorpus>(history ? "procurement-project-history-20261124.json" : materials ? "procurement-project-materials-20261124.json" : "procurement-notices-20261124.json"),
  read<FamilySplitPlan>(history ? "procurement-history-split.json" : materials ? "procurement-materials-split.json" : "procurement-project-split.json"),
  read<DraftDataset>(history ? "procurement-history-draft-cases.json" : materials ? "procurement-materials-draft-cases.json" : "procurement-project-draft-cases.json")), null, 2));
