BEGIN;
-- BEGIN TOPIC SUMMARY
CREATE TABLE IF NOT EXISTS karda_kb.topic_summary (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL,
  dossier_id UUID NOT NULL,
  input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  payload_hash VARCHAR(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  selection JSONB NOT NULL CHECK (jsonb_typeof(selection)='object'),
  created_by VARCHAR(128) NOT NULL CHECK (length(btrim(created_by))>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,id),
  FOREIGN KEY(kb_id,dossier_id) REFERENCES karda_kb.topic_dossier(kb_id,id)
);
-- END TOPIC SUMMARY
-- BEGIN TOPIC SUMMARY LOCKS
GRANT SELECT, INSERT ON karda_kb.topic_summary TO karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.topic_summary FROM karda_svc;
-- END TOPIC SUMMARY LOCKS
COMMIT;
