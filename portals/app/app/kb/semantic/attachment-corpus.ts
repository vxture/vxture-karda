import { createHash } from "node:crypto";
import type { EvaluationSource } from "./evaluation";

export interface AttachmentInput {
  id: string; title: string; url: string; projectFamilyId: string; projectNumber: string;
  parentSourceId: string; publishedOn: string; binarySha256: string; documentXmlSha256: string;
  sectionLabels: string[];
}
export interface AttachmentSource extends EvaluationSource, AttachmentInput {
  normalization: "docx-main-paragraphs-v1";
  paragraphs: string[];
}
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** Rebuild anchors from retained paragraphs. Binary-to-paragraph provenance is checked offline. */
export function reconstructAttachment(input: AttachmentInput & Pick<AttachmentSource, "normalization" | "paragraphs">): AttachmentSource {
  if (input.normalization !== "docx-main-paragraphs-v1" ||
      ![input.id, input.title, input.projectFamilyId, input.projectNumber, input.parentSourceId].every(s => typeof s === "string" && s.trim()) ||
      !/^https:\/\/download\.ccgp\.gov\.cn\/oss\/download\?uuid=[A-F0-9]{30,32}$/.test(input.url) ||
      ![input.binarySha256, input.documentXmlSha256].every(s => /^[a-f0-9]{64}$/.test(s)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.publishedOn) ||
      !Array.isArray(input.paragraphs) || input.paragraphs.length < 1 || input.paragraphs.length > 5000 ||
      input.paragraphs.some(p => typeof p !== "string" || !p.trim() || p.length > 10000 || /[\r\n]/.test(p)) ||
      !Array.isArray(input.sectionLabels) || !input.sectionLabels.length || new Set(input.sectionLabels).size !== input.sectionLabels.length) {
    throw new Error("invalid_attachment_source");
  }
  const starts = input.sectionLabels.map(label => input.paragraphs.indexOf(label));
  if (starts[0] !== 0 || starts.some((p, i) => p < 0 || (i > 0 && p <= starts[i - 1]) ||
      input.paragraphs.lastIndexOf(input.sectionLabels[i]) !== p)) throw new Error("attachment_section_mismatch");
  const text = input.paragraphs.join("\n") + "\n";
  if (text.length > 2 * 1024 * 1024 || !text.includes(input.projectNumber)) throw new Error("attachment_project_mismatch");
  const offsets = [0]; input.paragraphs.forEach(p => offsets.push(offsets[offsets.length - 1] + p.length + 1));
  return { ...input, edition: `${input.publishedOn} parent notice attachment; DOCX ${input.binarySha256}; XML ${input.documentXmlSha256}; main-body paragraphs only; not full tender documents`,
    text, canonicalSha256: sha256(text), sections: starts.map((p, i) => ({ id: `section-${i + 1}`,
      label: input.sectionLabels[i], start: offsets[p], end: offsets[starts[i + 1] ?? input.paragraphs.length] - 1 })) };
}
