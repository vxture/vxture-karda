import { createHash } from "node:crypto";
import { corpusFingerprint, evaluateDraftLexical, validateEvaluation, type DraftDataset, type EvaluationCorpus } from "./evaluation";
import { reconstructNotice, type NoticeSource } from "./notice-corpus";
import { reconstructAttachment, type AttachmentSource } from "./attachment-corpus";

export interface NoticeCorpus extends EvaluationCorpus { sources: NoticeSource[] }
export interface ProjectCorpus extends EvaluationCorpus { sources: (NoticeSource | AttachmentSource)[] }
export interface FamilySplitPlan {
  formatVersion: 1;
  status: "proposed_unreviewed";
  familyCorpusSha256: string;
  families: { familyId: string; projectNumber: string; split: "development" | "reserved"; sourceIds: string[] }[];
}
const hash = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Existing evaluation fingerprint plus project grouping and acquisition identity. */
export function familyCorpusFingerprint(corpus: ProjectCorpus): string {
  return hash({ corpusSha256: corpusFingerprint(corpus), sources: corpus.sources.map(s => ({ id: s.id,
    projectFamilyId: s.projectFamilyId, projectNumber: s.projectNumber,
    ...("noticeKind" in s ? { noticeKind: s.noticeKind, publishedOn: s.publishedOn,
      savedHtmlSha256: s.savedHtmlSha256, selectedHtmlSha256: s.selectedHtmlSha256, omittedSections: s.omittedSections }
      : { publishedOn: s.publishedOn, parentSourceId: s.parentSourceId, binarySha256: s.binarySha256,
        documentXmlSha256: s.documentXmlSha256, normalization: s.normalization, sectionLabels: s.sectionLabels }),
  })).sort((a, b) => a.id.localeCompare(b.id)) });
}

/** No caller switch for scoring reserved projects or downgrading family isolation. */
export function validateFamilySplit(corpus: ProjectCorpus, plan: FamilySplitPlan): Set<string> {
  if (corpus.formatVersion !== 1 || corpus.dataClass !== "public_business_notice_snapshot" ||
      !corpus.sources.length || plan.formatVersion !== 1 || plan.status !== "proposed_unreviewed" ||
      plan.familyCorpusSha256 !== familyCorpusFingerprint(corpus) || !Array.isArray(plan.families)) throw new Error("family_plan_binding_mismatch");
  const sources = new Map<string, NoticeSource | AttachmentSource>();
  for (const source of corpus.sources) {
    if (sources.has(source.id) || !nonempty(source.projectFamilyId) || !nonempty(source.projectNumber) ||
        !source.text.includes(source.projectNumber)) throw new Error("invalid_family_source");
    const rebuilt = source.normalization === "docx-main-paragraphs-v1" ? reconstructAttachment(source) : reconstructNotice(source);
    if (rebuilt.text !== source.text || rebuilt.canonicalSha256 !== source.canonicalSha256 || rebuilt.edition !== source.edition ||
        JSON.stringify(rebuilt.sections) !== JSON.stringify(source.sections)) throw new Error("family_source_reconstruction_mismatch");
    sources.set(source.id, source);
  }
  for (const source of corpus.sources) {
    if (source.normalization !== "docx-main-paragraphs-v1") continue;
    const parent = sources.get(source.parentSourceId);
    if (!parent || parent.normalization === "docx-main-paragraphs-v1" || parent.projectFamilyId !== source.projectFamilyId ||
        parent.projectNumber !== source.projectNumber || parent.publishedOn !== source.publishedOn) throw new Error("attachment_parent_mismatch");
  }
  const assigned = new Set<string>(), familyIds = new Set<string>(), projectNumbers = new Set<string>();
  const development = new Set<string>(), reserved = new Set<string>(), copies = new Map<string, string>();
  for (const family of plan.families) {
    const projectNumber = family.projectNumber?.trim().toUpperCase();
    if (!nonempty(family.familyId) || !nonempty(projectNumber) || familyIds.has(family.familyId) || projectNumbers.has(projectNumber) ||
        !["development", "reserved"].includes(family.split) || !Array.isArray(family.sourceIds) || !family.sourceIds.length) throw new Error("invalid_project_family");
    familyIds.add(family.familyId); projectNumbers.add(projectNumber);
    for (const id of family.sourceIds) {
      const source = sources.get(id);
      if (!source || assigned.has(id) || source.projectFamilyId !== family.familyId ||
          source.projectNumber.trim().toUpperCase() !== projectNumber) throw new Error("family_source_assignment_mismatch");
      assigned.add(id);
      const selected = family.split === "development" ? development : reserved;
      selected.add(id);
      // Renaming a source or project cannot disguise identical material across partitions.
      const snapshotHash = "savedHtmlSha256" in source ? source.savedHtmlSha256 : source.binarySha256;
      for (const key of [`url:${source.url}`, `text:${source.canonicalSha256}`, `snapshot:${snapshotHash}`]) {
        const split = copies.get(key);
        if (split && split !== family.split) throw new Error("cross_family_source_overlap");
        copies.set(key, family.split);
      }
    }
  }
  if (assigned.size !== sources.size || !development.size || !reserved.size) throw new Error("incomplete_family_partition");
  return development;
}

export function selectFamilyDevelopment(corpus: ProjectCorpus, plan: FamilySplitPlan, dataset: DraftDataset) {
  const development = validateFamilySplit(corpus, plan);
  validateEvaluation(corpus, dataset);
  if (dataset.cases.some(item => item.split !== "development" || item.evidence.some(e => !development.has(e.sourceId)))) {
    throw new Error("reserved_project_case_refused");
  }
  const selected: EvaluationCorpus = { ...corpus, sources: corpus.sources.filter(s => development.has(s.id)) };
  return { corpus: selected, dataset: { ...dataset, corpusSha256: corpusFingerprint(selected) } };
}

export function evaluateFamilyDevelopment(corpus: ProjectCorpus, plan: FamilySplitPlan, dataset: DraftDataset, topK = 5) {
  const selected = selectFamilyDevelopment(corpus, plan, dataset);
  const report = evaluateDraftLexical(selected.corpus, selected.dataset, topK);
  return { ...report, fullCorpusSha256: corpusFingerprint(corpus), familyCorpusSha256: familyCorpusFingerprint(corpus),
    familyPlanSha256: hash(plan), reservedSourcesNotIndexed: corpus.sources.length - selected.corpus.sources.length,
    developmentProjectFamilies: plan.families.filter(f => f.split === "development").length,
    reservedProjectFamilies: plan.families.filter(f => f.split === "reserved").length,
    crossDocumentCases: selected.dataset.cases.filter(c => new Set(c.evidence.map(e => e.sourceId)).size > 1).length,
    limitations: [
      "Agent-authored development labels; no human-reviewed gold or business acceptance.",
      "Proposed project-family partition; not a frozen, independently reviewed or blinded holdout.",
      "Reserved project sources are excluded before indexing; no reserved labels or scores produced.",
      "Notice excerpts and any explicitly retained attachments only; not full tender documents or current procurement advice.",
      "Cross-document evidence counts are structural, not proof of reasoning; no answer generation or graph improvement measured.",
    ],
  };
}
