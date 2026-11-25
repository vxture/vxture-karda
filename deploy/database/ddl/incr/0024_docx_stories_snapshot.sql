BEGIN;
ALTER TABLE karda_kb.document_text_snapshot DROP CONSTRAINT IF EXISTS document_text_snapshot_parser_check;
ALTER TABLE karda_kb.document_text_snapshot ADD CONSTRAINT document_text_snapshot_parser_check CHECK (
  (mime='application/pdf' AND parser_version='pypdf-6.21.4-v1') OR
  (mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    AND parser_version IN ('docx-main-body-v1','docx-body-tables-v2','docx-referenced-stories-v3')) OR
  (mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND parser_version='xlsx-literal-cells-v1') OR
  (mime='application/vnd.openxmlformats-officedocument.presentationml.presentation' AND parser_version='pptx-slide-text-v1'));
COMMIT;
