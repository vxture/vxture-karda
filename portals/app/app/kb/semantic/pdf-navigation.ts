import type { LocalPdfSource } from "./pdf-corpus";
import { validateLocalPdfSource } from "./pdf-corpus";

export interface PdfNavigationPlan {
  formatVersion: 1;
  binarySha256: string;
  groups: { id: string; label: string; startPage: number; endPage: number; kind: "heading" | "page_range" }[];
}

/** Navigation only: never creates assertions or changes review fingerprints. */
export function validatePdfNavigation(source: LocalPdfSource, plan: PdfNavigationPlan): void {
  validateLocalPdfSource(source);
  if (!plan || plan.formatVersion !== 1 || plan.binarySha256 !== source.binarySha256 ||
      !Array.isArray(plan.groups) || !plan.groups.length || plan.groups.length > 12) throw new Error("pdf_navigation_binding_mismatch");
  const ids = new Set<string>();
  let next = 1;
  for (const group of plan.groups) {
    if (!group || typeof group.id !== "string" || !group.id.trim() || ids.has(group.id) ||
        typeof group.label !== "string" || !group.label.trim() || group.label.length > 200 ||
        !Number.isInteger(group.startPage) || !Number.isInteger(group.endPage) ||
        group.startPage !== next || group.endPage < next || group.endPage > source.pages.length) throw new Error("invalid_pdf_navigation_range");
    if (group.kind === "heading") {
      const normalize = (value: string) => value.replace(/\s+/g, "");
      if (!normalize(source.pages[group.startPage - 1].text).includes(normalize(group.label))) throw new Error("pdf_heading_not_on_start_page");
    } else if (group.kind !== "page_range" || group.label !== `PDF pages ${group.startPage}-${group.endPage}`) {
      throw new Error("invalid_pdf_navigation_label");
    }
    ids.add(group.id); next = group.endPage + 1;
  }
  if (next !== source.pages.length + 1) throw new Error("incomplete_pdf_navigation");
}
