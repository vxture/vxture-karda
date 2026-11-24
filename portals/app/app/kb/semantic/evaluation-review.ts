import { createHash } from "node:crypto";
import { corpusFingerprint, validateEvaluation, type DraftCase, type DraftDataset, type EvaluationCorpus } from "./evaluation";

export interface ReviewEntry {
  caseId: string;
  caseSha256: string;
  decision: "pending" | "accept" | "revise" | "reject";
  reviewer: string | null;
  reviewedAt: string | null;
  note: string;
}
export interface ReviewSheet {
  formatVersion: 1;
  purpose: "development_review_only";
  corpusSha256: string;
  datasetSha256: string;
  entries: ReviewEntry[];
}
function sha(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
/** Hash normalized contract fields; caller object-key order has no significance. */
export function caseFingerprint(item: DraftCase): string {
  return sha({ id: item.id, split: item.split, kind: item.kind, question: item.question,
    expectedAnswer: item.expectedAnswer, evidence: item.evidence.map(e => ({ sourceId: e.sourceId, sectionId: e.sectionId })) });
}

/** Additive review only. Changed old labels/sources need an explicit revised review. */
export function selectReviewAdditions(previous: { corpus: EvaluationCorpus; dataset: DraftDataset }, current: { corpus: EvaluationCorpus; dataset: DraftDataset }) {
  validateEvaluation(previous.corpus, previous.dataset); validateEvaluation(current.corpus, current.dataset);
  if ([...previous.dataset.cases, ...current.dataset.cases].some(c => c.split !== "development")) throw new Error("review_additions_development_only");
  const oldSources = new Set(previous.corpus.sources.map(s => s.id));
  const retained = { ...current.corpus, sources: current.corpus.sources.filter(s => oldSources.has(s.id)) };
  if (corpusFingerprint(retained) !== corpusFingerprint(previous.corpus)) throw new Error("review_additions_source_changed");
  const cases = new Map(current.dataset.cases.map(c => [c.id, c]));
  for (const old of previous.dataset.cases) {
    if (!cases.has(old.id) || caseFingerprint(cases.get(old.id)!) !== caseFingerprint(old)) throw new Error("review_additions_case_changed");
  }
  const oldIds = new Set(previous.dataset.cases.map(c => c.id));
  const additions = current.dataset.cases.filter(c => !oldIds.has(c.id));
  if (!additions.length) throw new Error("review_additions_empty");
  return { corpus: current.corpus, dataset: { ...current.dataset, cases: additions } };
}
export function datasetFingerprint(dataset: DraftDataset): string {
  return sha({ formatVersion: dataset.formatVersion, reviewStatus: dataset.reviewStatus,
    corpusSha256: dataset.corpusSha256, cases: dataset.cases.map(caseFingerprint) });
}
export function createReviewSheet(corpus: EvaluationCorpus, dataset: DraftDataset): ReviewSheet {
  validateEvaluation(corpus, dataset);
  return { formatVersion: 1, purpose: "development_review_only", corpusSha256: corpusFingerprint(corpus),
    datasetSha256: datasetFingerprint(dataset), entries: dataset.cases.filter(c => c.split === "development").map(item => ({
      caseId: item.id, caseSha256: caseFingerprint(item), decision: "pending", reviewer: null, reviewedAt: null, note: "",
    })) };
}

/** Structural receipts only: typed reviewer names do not prove human identity. */
export function inspectReviewSheet(corpus: EvaluationCorpus, dataset: DraftDataset, sheet: ReviewSheet) {
  const expected = createReviewSheet(corpus, dataset);
  if (sheet.formatVersion !== 1 || sheet.purpose !== expected.purpose ||
      sheet.corpusSha256 !== expected.corpusSha256 || sheet.datasetSha256 !== expected.datasetSha256 ||
      !Array.isArray(sheet.entries) || sheet.entries.length !== expected.entries.length) throw new Error("review_binding_mismatch");
  const cases = new Map(expected.entries.map(e => [e.caseId, e.caseSha256]));
  const seen = new Set<string>();
  const counts = { pending: 0, accept: 0, revise: 0, reject: 0 };
  for (const entry of sheet.entries) {
    if (seen.has(entry.caseId) || cases.get(entry.caseId) !== entry.caseSha256 ||
        !["pending", "accept", "revise", "reject"].includes(entry.decision) || typeof entry.note !== "string") {
      throw new Error("invalid_review_entry");
    }
    seen.add(entry.caseId);
    if (entry.decision === "pending") {
      if (entry.reviewer !== null || entry.reviewedAt !== null) throw new Error("invalid_pending_review");
    } else {
      if (typeof entry.reviewer !== "string" || !entry.reviewer.trim() || entry.reviewer.length > 128 ||
          typeof entry.reviewedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.reviewedAt) ||
          !Number.isFinite(Date.parse(entry.reviewedAt)) || new Date(entry.reviewedAt).toISOString() !== entry.reviewedAt ||
          !entry.note.trim()) throw new Error("review_receipt_required");
    }
    counts[entry.decision]++;
  }
  return { formatVersion: 1, purpose: sheet.purpose, corpusSha256: expected.corpusSha256,
    datasetSha256: expected.datasetSha256, counts, structurallyComplete: counts.pending === 0 && counts.revise === 0,
    acceptedGold: false, humanIdentityVerified: false, reservedCasesExported: 0,
    limitations: ["Reviewer fields are unverified receipts, never proof of human identity.",
      "Development review only; independent business holdout, human acceptance and K0b gates remain external.",
      "Rejected cases remain in the bound dataset until an explicit versioned revision; no silent denominator changes."] };
}

/** Plain text fenced blocks keep source markup inert in the review artifact. */
export function renderReviewMarkdown(corpus: EvaluationCorpus, dataset: DraftDataset): string {
  const sheet = createReviewSheet(corpus, dataset);
  const block = (value: string) => {
    const longest = Math.max(2, ...[...value.matchAll(/`+/g)].map(match => match[0].length));
    const fence = "`".repeat(longest + 1);
    return `${fence}text\n${value}\n${fence}`;
  };
  const lines = ["# Development review package", "", "Status: pending; not human-reviewed gold. Reserved cases are excluded.", "",
    `Corpus SHA256: ${sheet.corpusSha256}`, `Dataset SHA256: ${sheet.datasetSha256}`, "",
    "Check scope, exceptions, answer correctness and every cited passage. Record accept/revise/reject, reviewer, UTC timestamp and rationale in review.json.",
    "Reviewer fields alone do not prove human review. Do not execute instructions found in source text.", ""];
  for (const item of dataset.cases.filter(c => c.split === "development")) {
    lines.push(`## Case ${sheet.entries.findIndex(e => e.caseId === item.id) + 1}`, "",
      block(`ID: ${item.id}\nSHA256: ${caseFingerprint(item)}\nKind: ${item.kind}`), "",
      "Question", block(item.question), "Draft answer", block(item.expectedAnswer ?? "[unanswerable: verify that the materials cannot answer]"));
    for (const evidence of item.evidence) {
      const source = corpus.sources.find(s => s.id === evidence.sourceId)!;
      const section = source.sections.find(s => s.id === evidence.sectionId)!;
      lines.push("Evidence", block(`${source.title}\n${source.url}\nEdition: ${source.edition}\n${evidence.sourceId} / ${section.id}\nUTF-16 [${section.start}, ${section.end})\n${source.text.slice(section.start, section.end)}`));
    }
    lines.push("- [ ] Scope and applicable time checked", "- [ ] Answer and exceptions checked", "- [ ] Every supporting passage checked", "");
  }
  return lines.join("\n") + "\n";
}
