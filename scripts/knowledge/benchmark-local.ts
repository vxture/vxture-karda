// Offline component diagnostics, never a service/UI/load-test acceptance claim.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cpus, platform, totalmem } from "node:os";
import { performance } from "node:perf_hooks";
import { createHash } from "node:crypto";
import { bm25Rank, type Bm25Doc } from "../../portals/app/app/kb/retrieval/bm25";
import { projectNeighborhood } from "../../portals/app/app/kb/semantic/projection";
import type { KnowledgeSnapshot, OntologySchema } from "../../portals/app/app/kb/semantic/contracts";
import { selectFamilyDevelopment, type ProjectCorpus, type FamilySplitPlan } from "../../portals/app/app/kb/semantic/evaluation-families";
import type { DraftDataset } from "../../portals/app/app/kb/semantic/evaluation";
import { corpusFingerprint } from "../../portals/app/app/kb/semantic/evaluation";
import { datasetFingerprint } from "../../portals/app/app/kb/semantic/evaluation-review";
import { writeReproducibleArtifact } from "./artifact-output";

const args = process.argv.slice(2);
if (args.length !== 1) throw new Error("usage: benchmark-local.ts new-output-json");
const root = resolve(import.meta.dirname, "corpus");
const read = <T>(name: string): T => JSON.parse(readFileSync(resolve(root, name), "utf8"));
const selected = selectFamilyDevelopment(read<ProjectCorpus>("procurement-project-materials-20261124.json"),
  read<FamilySplitPlan>("procurement-materials-split.json"), read<DraftDataset>("procurement-materials-draft-cases.json"));
const schema: OntologySchema = { namespace: "benchmark", schemaId: "star", version: "1", entityTypes: ["item"],
  relationTypes: [{ id: "requires", sourceTypes: ["item"], targetTypes: ["item"] }] };

function graph(size: number): KnowledgeSnapshot {
  const s: KnowledgeSnapshot = { entities: [{ id: "root", kbId: "visible", type: "item", label: "root" }],
    relations: [], assertions: [], evidence: [], sources: [] };
  for (const [kbId, documentId, version, withdrawn] of [
    ["visible", "current", 2, false], ["visible", "withdrawn", 2, true], ["visible", "stale", 2, false], ["hidden", "private", 2, false],
  ] as const) s.sources.push({ kbId, documentId, version, withdrawn, current: true, textLength: 100 });
  s.entities.push({ id: "private-root", kbId: "hidden", type: "item", label: "hidden" });
  for (let i = 0; i < size; i++) {
    const category = i % 10, kbId = category === 0 ? "hidden" : "visible";
    const documentId = category === 0 ? "private" : category === 1 ? "withdrawn" : category === 2 ? "stale" : "current";
    s.entities.push({ id: `n${i}`, kbId, type: "item", label: `item ${i}` });
    s.evidence.push({ id: `e${i}`, kbId, documentId, documentVersion: category === 2 ? 1 : 2, stance: "supports", start: 0, end: 1 });
    s.assertions.push({ id: `a${i}`, kbId, contentState: "indexed", verificationState: "verified", verificationExpiresAt: null,
      supersededById: null, validFrom: null, validUntil: null, evidenceIds: [`e${i}`] });
    s.relations.push({ id: `r${i}`, kbId, schema, type: "requires", sourceId: category === 0 ? "private-root" : "root",
      targetId: `n${i}`, assertionIds: [`a${i}`], origin: "asserted" });
  }
  return s;
}

function measure<T>(run: () => T, verify: (value: T) => void) {
  for (let i = 0; i < 5; i++) verify(run());
  const samplesMs: number[] = [];
  for (let i = 0; i < 30; i++) {
    const start = performance.now(), value = run();
    samplesMs.push(performance.now() - start); verify(value);
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return { samplesMs, medianMs: sorted[14], p95Ms: sorted[Math.ceil(sorted.length * 0.95) - 1], maxMs: sorted[sorted.length - 1] };
}

const graphRuns = [100, 1000, 5000].map(size => {
  const snapshot = graph(size);
  const timing = measure(() => projectNeighborhood(snapshot, schema, { visibleKbIds: new Set(["visible"]), now: "2026-11-24T00:00:00Z" },
    { seedIds: ["root"], maxHops: 2, maxNodes: 100, maxEdges: 1000 }), result => {
    assert.equal(result.edges.length, Math.min(size * 0.7, 99));
    assert.equal(result.nodes.length, result.edges.length + 1);
    assert.equal(result.truncated, size * 0.7 > 99);
    for (const rows of [result.nodes, result.edges, result.assertions, result.evidence]) assert(rows.every(r => r.kbId === "visible"));
    assert(result.evidence.every(e => e.documentId === "current" && e.documentVersion === 2));
  });
  return { inputRelations: size, inputEntities: snapshot.entities.length, excludedRelationPercent: 30,
    maxOutputNodes: 100, maxOutputEdges: 1000, maxHops: 2, ...timing };
});

const realDocs = selected.corpus.sources.flatMap(s => s.sections.map(p => ({ id: JSON.stringify([s.id, p.id]), text: s.text.slice(p.start, p.end) })));
const lexicalInputs: { name: string; docs: Bm25Doc[]; queries: string[] }[] = [
  { name: "public-development-materials", docs: realDocs, queries: selected.dataset.cases.map(c => c.question) },
  ...[100, 1000].map(size => ({ name: "synthetic-short-text", docs: Array.from({ length: size }, (_, i) => ({
    id: `d${i}`, text: `project ${i} procurement qualification evidence ${i % 7} \u91c7\u8d2d\u4e1a\u7ee9\u5408\u540c\u8bc1\u660e\u6750\u6599`,
  })), queries: ["procurement qualification", "\u4e1a\u7ee9\u5408\u540c", "evidence 3"] })),
];
const lexicalRuns = lexicalInputs.map(input => {
  let index = 0;
  return { name: input.name, documents: input.docs.length, textCodeUnits: input.docs.reduce((n, d) => n + d.text.length, 0),
    queries: input.queries.length, ...measure(() => bm25Rank(input.docs, input.queries[index++ % input.queries.length]).slice(0, 5), result => {
      assert(result.length <= 5); assert(result.every(r => input.docs.some(d => d.id === r.id) && r.score > 0));
    }) };
});
writeReproducibleArtifact(resolve(args[0]), JSON.stringify({ formatVersion: 1, status: "local_component_diagnostic_only",
  measuredAt: new Date().toISOString(), environment: { node: process.version, platform: platform(), cpu: cpus()[0]?.model,
    logicalCpus: cpus().length, totalMemoryBytes: totalmem() }, methodology: { concurrency: 1, warmups: 5, samples: 30,
    percentile: "nearest-rank", excludes: ["fixture construction", "verification assertions", "database", "object storage", "network", "Atlas", "browser layout/render"] },
  workloadSha256: createHash("sha256").update(readFileSync(import.meta.filename, "utf8").replace(/\r\n/g, "\n")).digest("hex"),
  developmentCorpusSha256: corpusFingerprint(selected.corpus), developmentDatasetSha256: datasetFingerprint(selected.dataset),
  proposedSystemTargetsMs: { retrievalApiP95: 700, graphFirstInteraction: 2000 }, graphRuns, lexicalRuns,
  limitations: ["Single machine, warm process, sequential calls; no service or UI SLA acceptance.",
    "Graph data is a synthetic star with 30% hidden/withdrawn/stale relations; not a business graph distribution.",
    "Synthetic lexical documents are short repeated templates, not full tender documents.",
    "Every sample checks graph exclusion and output bounds; this does not replace end-to-end authorization acceptance.",
    "No latency pass/fail or K0b completion is inferred from these component measurements."] }, null, 2) + "\n");
