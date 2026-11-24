// Usage: tsx scripts/knowledge/export-review-graph.ts new-output-html
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { selectFamilyDevelopment, evaluateFamilyDevelopment, type ProjectCorpus, type FamilySplitPlan } from "../../portals/app/app/kb/semantic/evaluation-families";
import { corpusFingerprint, type DraftDataset } from "../../portals/app/app/kb/semantic/evaluation";
import { createReviewSheet, datasetFingerprint } from "../../portals/app/app/kb/semantic/evaluation-review";
import { renderOfflineReviewHtml } from "../../portals/app/app/kb/semantic/review-html";
import { writeReproducibleArtifact } from "./artifact-output";

if (process.argv.slice(2).length !== 1) throw new Error("usage: export-review-graph.ts new-output-html");
const root = resolve(import.meta.dirname, "corpus");
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const corpus = read<ProjectCorpus>("procurement-project-history-20261124.json"), plan = read<FamilySplitPlan>("procurement-history-split.json"),
  dataset = read<DraftDataset>("procurement-history-draft-cases.json");
const selected = selectFamilyDevelopment(corpus, plan, dataset), report = evaluateFamilyDevelopment(corpus, plan, dataset);
const data = { corpusSha256: corpusFingerprint(selected.corpus), datasetSha256: datasetFingerprint(selected.dataset), cases: selected.dataset.cases,
  reviewSheet: createReviewSheet(selected.corpus, selected.dataset),
  results: report.cases, sources: (selected.corpus as ProjectCorpus).sources.map(s => ({ id: s.id, title: s.title, url: s.url,
    projectFamilyId: s.projectFamilyId, projectNumber: s.projectNumber, publishedOn: s.publishedOn,
    kind: "noticeKind" in s ? s.noticeKind : "attachment", edition: s.edition, text: s.text, sections: s.sections })) };
const html = renderOfflineReviewHtml(readFileSync(resolve(import.meta.dirname, "graph-review.html"), "utf8"),
  readFileSync(resolve(import.meta.dirname, "../../portals/app/app/kb/semantic/review-receipts.js"), "utf8").replace(/^export /gm, "") + "\n" +
  readFileSync(resolve(import.meta.dirname, "graph-review.js"), "utf8"), data);
writeReproducibleArtifact(resolve(process.argv[2]), html);
console.log(JSON.stringify({ output: resolve(process.argv[2]), sources: data.sources.length, cases: data.cases.length, acceptedGold: false, scope: "offline_source_review_prototype" }));
