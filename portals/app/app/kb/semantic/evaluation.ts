// Offline evaluation contracts. No model grading and no production endpoint.
import { createHash } from "node:crypto";
import { bm25Rank } from "../retrieval/bm25";

export interface EvaluationSource {
  id: string; title: string; url: string; edition: string; canonicalSha256: string; text: string;
  sections: {id: string; label: string; start: number; end: number}[];
}
export interface EvaluationCorpus {
  formatVersion: number;
  dataClass: string;
  sources: EvaluationSource[];
}
export interface DraftCase {
  id: string;
  split: "development" | "reserved";
  kind: "single" | "multi_article" | "unanswerable";
  question: string;
  expectedAnswer: string | null;
  evidence: {sourceId: string; sectionId: string}[];
}
export interface DraftDataset {
  formatVersion: number;
  reviewStatus: "agent_draft";
  corpusSha256: string;
  cases: DraftCase[];
}
export function corpusFingerprint(corpus: EvaluationCorpus): string {
  return createHash("sha256").update(JSON.stringify(corpus.sources
    .map(s => ({
      id:s.id, title:s.title, url:s.url, edition:s.edition,
      canonicalSha256:s.canonicalSha256, sections:s.sections,
    })).sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0))).digest("hex");
}
const nonempty = (s: unknown): s is string => typeof s === "string" && s.trim().length > 0;
const evidenceKey = (sourceId: string, sectionId: string) => JSON.stringify([sourceId,sectionId]);

export function validateEvaluation(corpus: EvaluationCorpus, dataset: DraftDataset): void {
  if (corpus.formatVersion !== 1 || !nonempty(corpus.dataClass) || corpus.sources.length === 0 ||
      dataset.formatVersion !== 1 || dataset.reviewStatus !== "agent_draft" || dataset.cases.length === 0) {
    throw new Error("invalid_evaluation_format");
  }
  const sourceIds = new Set<string>();
  const sectionKeys = new Set<string>();
  for (const source of corpus.sources) {
    const sectionIds = new Set<string>();
    if (![source.id,source.title,source.edition,source.text].every(nonempty) ||
        sourceIds.has(source.id) || !/^https:\/\//.test(source.url) || source.sections.length === 0) {
      throw new Error("invalid_source_manifest");
    }
    sourceIds.add(source.id);
    if (createHash("sha256").update(source.text,"utf8").digest("hex") !== source.canonicalSha256) {
      throw new Error("source_hash_mismatch");
    }
    let previousEnd = 0;
    for (const section of source.sections) {
      if (!nonempty(section.id) || !nonempty(section.label) || sectionIds.has(section.id) ||
          !Number.isInteger(section.start) || !Number.isInteger(section.end) ||
          section.start < previousEnd || section.start >= section.end || section.end > source.text.length ||
          !source.text.slice(section.start,section.end).startsWith(section.label)) {
        throw new Error("invalid_section_anchor");
      }
      previousEnd = section.end;
      sectionIds.add(section.id);
      sectionKeys.add(evidenceKey(source.id,section.id));
    }
  }
  if (dataset.corpusSha256 !== corpusFingerprint(corpus)) throw new Error("dataset_corpus_mismatch");
  const caseIds = new Set<string>();
  const questions = new Set<string>();
  const splits = new Map<string, Set<string>>();
  for (const item of dataset.cases) {
    if (!nonempty(item.id) || !nonempty(item.question) || caseIds.has(item.id) || questions.has(item.question.trim()) ||
        !["development","reserved"].includes(item.split) ||
        !["single","multi_article","unanswerable"].includes(item.kind)) throw new Error("invalid_evaluation_case");
    caseIds.add(item.id);
    questions.add(item.question.trim());
    const keys = item.evidence.map(e => evidenceKey(e.sourceId,e.sectionId));
    if (new Set(keys).size !== keys.length || keys.some(key => !sectionKeys.has(key)) ||
        (item.kind === "unanswerable" ? item.evidence.length !== 0 || item.expectedAnswer !== null :
          !nonempty(item.expectedAnswer) || item.evidence.length < (item.kind === "multi_article" ? 2 : 1))) {
      throw new Error("invalid_case_evidence");
    }
    const used = splits.get(item.split) ?? new Set<string>();
    keys.forEach(key => used.add(key));
    splits.set(item.split,used);
  }
  const development = splits.get("development") ?? new Set<string>();
  if ([...(splits.get("reserved") ?? [])].some(key => development.has(key))) {
    throw new Error("cross_split_evidence_overlap");
  }
}

/** Only development questions are scored. Reserved cases cannot be exposed by a flag. */
export function evaluateDraftLexical(corpus: EvaluationCorpus, dataset: DraftDataset, topK = 5) {
  validateEvaluation(corpus,dataset);
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) throw new Error("invalid_top_k");
  const documents = corpus.sources.flatMap(source => source.sections.map(section => ({
    id:evidenceKey(source.id,section.id), text:source.text.slice(section.start,section.end),
  })));
  const results = dataset.cases.filter(c => c.split === "development").map(c => {
    const retrieved = bm25Rank(documents,c.question).slice(0,topK).map(r => r.id);
    const hitCount = c.evidence.filter(e => retrieved.includes(evidenceKey(e.sourceId,e.sectionId))).length;
    return {
      id:c.id, kind:c.kind, retrieved, expectedEvidence:c.evidence.length, hitCount,
      allEvidenceRetrieved:c.kind === "unanswerable" ? null : hitCount === c.evidence.length,
    };
  });
  const answerable = results.filter(r => r.kind !== "unanswerable");
  const expectedEvidence = answerable.reduce((sum,r)=>sum+r.expectedEvidence,0);
  const hitEvidence = answerable.reduce((sum,r)=>sum+r.hitCount,0);
  return {
    reportVersion:2, evidenceIdentity:"source_and_section", dataClass:corpus.dataClass, reviewStatus:dataset.reviewStatus,
    acceptedGold:false, corpusSha256:corpusFingerprint(corpus), topK,
    evaluatedSplit:"development", reservedCasesNotScored:dataset.cases.filter(c=>c.split==="reserved").length,
    metrics:{
      expectedEvidence, hitEvidence,
      evidenceRecall:expectedEvidence ? hitEvidence/expectedEvidence : null,
      answerableCases:answerable.length,
      completeEvidenceCases:answerable.filter(r=>r.allEvidenceRetrieved).length,
      unanswerableCasesReturningCandidates:results.filter(r=>r.kind==="unanswerable" && r.retrieved.length>0).length,
    },
    limitations:[
      "Agent-authored draft labels; not a human-reviewed gold set.",
      "Retrieval evidence coverage only; not answer correctness, refusal quality or graph improvement.",
      "Historical legal source snapshot; current legal status has not been determined.",
      "Reserved evidence is disjoint by article, but is not an independent business-document holdout.",
    ],
    cases:results,
  };
}
