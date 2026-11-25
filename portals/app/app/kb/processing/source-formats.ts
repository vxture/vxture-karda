/** Versioned reader compatibility and current runtime parser contract. */
export const PDF_MIME="application/pdf";
export const DOCX_MIME="application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const PPTX_MIME="application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const SOURCE_FORMATS=[
  {mime:PDF_MIME,parser:"pypdf-6.21.4-v1",accepted:["pypdf-6.21.4-v1"],script:"extract-pdf.py"},
  {mime:DOCX_MIME,parser:"docx-cell-grid-v4",accepted:["docx-main-body-v1","docx-body-tables-v2","docx-referenced-stories-v3","docx-cell-grid-v4"],script:"extract-docx-grid.py"},
  {mime:XLSX_MIME,parser:"xlsx-cell-ranges-v2",accepted:["xlsx-literal-cells-v1","xlsx-cell-ranges-v2"],script:"extract-xlsx-ranges.py"},
  {mime:PPTX_MIME,parser:"pptx-cell-grid-v2",accepted:["pptx-slide-text-v1","pptx-cell-grid-v2"],script:"extract-pptx-grid.py"},
] as const;
