BEGIN;
-- BEGIN DOCUMENT TEXT SNAPSHOT
CREATE TABLE IF NOT EXISTS karda_kb.document_text_snapshot (
  document_id UUID NOT NULL REFERENCES karda_kb.document(id) ON DELETE CASCADE,
  document_version INTEGER NOT NULL CHECK (document_version>0),
  content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  mime VARCHAR(128) NOT NULL,
  parser_version VARCHAR(64) NOT NULL,
  canonical_text TEXT NOT NULL CHECK (char_length(canonical_text) BETWEEN 1 AND 5000000),
  text_hash VARCHAR(64) NOT NULL CHECK (text_hash ~ '^[a-f0-9]{64}$'),
  locators JSONB NOT NULL CHECK (jsonb_typeof(locators)='array' AND jsonb_array_length(locators) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(document_id,document_version),
  CHECK ((mime='application/pdf' AND parser_version='pypdf-6.21.4-v1') OR
    (mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document' AND parser_version='docx-main-body-v1'))
);
-- END DOCUMENT TEXT SNAPSHOT
-- BEGIN DOCUMENT TEXT LOCKS
GRANT SELECT, INSERT ON karda_kb.document_text_snapshot TO karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.document_text_snapshot FROM karda_svc;
-- END DOCUMENT TEXT LOCKS
COMMIT;
