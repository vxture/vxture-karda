BEGIN;
-- BEGIN DOCUMENT OCR DRAFT
CREATE TABLE IF NOT EXISTS karda_kb.document_ocr_draft (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES karda_kb.document(id) ON DELETE CASCADE,
  content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  base_version INTEGER NOT NULL CHECK (base_version>=0),
  model_code VARCHAR(128) NOT NULL CHECK (length(btrim(model_code))>0),
  created_by VARCHAR(128) NOT NULL CHECK (length(btrim(created_by))>0),
  state VARCHAR(16) NOT NULL CHECK (state IN ('running','ready','failed','rejected','committed')),
  payload JSONB,
  payload_hash VARCHAR(64) CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  error_code VARCHAR(64),
  committed_version INTEGER CHECK (committed_version>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((payload IS NULL)=(payload_hash IS NULL)),
  CHECK (payload IS NULL OR jsonb_typeof(payload)='object'),
  CHECK (state NOT IN ('ready','committed') OR payload IS NOT NULL),
  CHECK ((state='committed')=(committed_version IS NOT NULL)),
  CHECK (committed_version IS NULL OR committed_version=base_version+1)
);
-- END DOCUMENT OCR DRAFT
ALTER TABLE karda_kb.document_text_snapshot DROP CONSTRAINT IF EXISTS document_text_snapshot_parser_check;
ALTER TABLE karda_kb.document_text_snapshot ADD CONSTRAINT document_text_snapshot_parser_check CHECK (
    (mime='application/pdf' AND parser_version IN ('pypdf-6.21.4-v1','atlas-ocr-v1')) OR
    (mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      AND parser_version IN ('docx-main-body-v1','docx-body-tables-v2','docx-referenced-stories-v3','docx-cell-grid-v4','docx-numbered-stories-v5')) OR
    (mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND parser_version IN ('xlsx-literal-cells-v1','xlsx-cell-ranges-v2')) OR
    (mime='application/vnd.openxmlformats-officedocument.presentationml.presentation' AND parser_version IN ('pptx-slide-text-v1','pptx-cell-grid-v2','pptx-authored-stories-v3')));
-- BEGIN DOCUMENT OCR LOCKS
REVOKE UPDATE, DELETE ON karda_kb.document_ocr_draft FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.document_ocr_draft TO karda_svc;
GRANT UPDATE (state,payload,payload_hash,error_code,committed_version) ON karda_kb.document_ocr_draft TO karda_svc;
-- END DOCUMENT OCR LOCKS
COMMIT;
