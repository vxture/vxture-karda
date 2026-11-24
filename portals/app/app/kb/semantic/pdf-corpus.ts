import { createHash } from "node:crypto";
import type { EvaluationSource } from "./evaluation";

export interface PdfExtraction {
  formatVersion: 1;
  binarySha256: string;
  extractor: { name: "pypdf"; version: "6.21.4" };
  pages: { page: number; text: string; textSha256: string }[];
}
export interface LocalPdfSource extends EvaluationSource, PdfExtraction {
  origin: "owner_supplied_local";
  normalization: "pdf-page-text-v1";
  projectNumber: string;
}
const sha = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const nonempty = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;

/** Page numbers are physical PDF pages; no inferred headings or table relationships. */
export function reconstructLocalPdf(input: PdfExtraction & { id: string; title: string; projectNumber: string }): LocalPdfSource {
  if (!input || input.formatVersion !== 1 || ![input.id, input.title, input.projectNumber].every(nonempty) ||
      !/^[a-f0-9]{64}$/.test(input.binarySha256) || input.extractor?.name !== "pypdf" || input.extractor?.version !== "6.21.4" ||
      !Array.isArray(input.pages) || input.pages.length < 1 || input.pages.length > 300) throw new Error("invalid_pdf_snapshot");
  let text = "", total = 0;
  const sections: EvaluationSource["sections"] = [];
  const pages = input.pages.map((p, index) => {
    if (!p || p.page !== index + 1 || typeof p.text !== "string" || p.text !== p.text.trim() || /[\r\x00]/.test(p.text) ||
        p.text.length > 400000 || sha(p.text) !== p.textSha256) throw new Error("invalid_pdf_page");
    total += p.text.length;
    const label = "PDF page " + p.page, start = text.length;
    text += label + "\n" + p.text + "\n";
    sections.push({ id: "page-" + p.page, label, start, end: text.length });
    return { page: p.page, text: p.text, textSha256: p.textSha256 };
  });
  if (!pages.some(p => p.text) || total > 10000000 || !text.includes(input.projectNumber)) throw new Error("pdf_text_or_project_missing");
  const binarySha256 = input.binarySha256;
  return { id: input.id, title: input.title, projectNumber: input.projectNumber,
    origin: "owner_supplied_local", normalization: "pdf-page-text-v1", formatVersion: 1,
    binarySha256, extractor: { name: "pypdf", version: "6.21.4" }, pages,
    url: "urn:sha256:" + binarySha256,
    edition: "pdf-page-text-v1/pypdf-6.21.4/" + encodeURIComponent(input.projectNumber) + "/" + binarySha256,
    text, canonicalSha256: sha(text), sections };
}

/** Local identity must be explicitly typed and reconstruct byte-for-byte. */
export function validateLocalPdfSource(source: LocalPdfSource): void {
  const rebuilt = reconstructLocalPdf(source);
  if (source.origin !== rebuilt.origin || source.normalization !== rebuilt.normalization || source.url !== rebuilt.url ||
      source.edition !== rebuilt.edition || source.text !== rebuilt.text || source.canonicalSha256 !== rebuilt.canonicalSha256 ||
      JSON.stringify(source.sections) !== JSON.stringify(rebuilt.sections)) throw new Error("pdf_source_reconstruction_mismatch");
}
