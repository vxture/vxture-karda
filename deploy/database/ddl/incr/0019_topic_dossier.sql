BEGIN;
-- BEGIN TOPIC DOSSIER
CREATE TABLE IF NOT EXISTS karda_kb.topic_dossier (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
  relation_type VARCHAR(128) NOT NULL CHECK (length(btrim(relation_type))>0),
  input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  payload_hash VARCHAR(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_by VARCHAR(128) NOT NULL CHECK (length(btrim(created_by))>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,id),
  UNIQUE(kb_id,relation_type,input_hash)
);
-- END TOPIC DOSSIER
-- BEGIN TOPIC DOSSIER LOCKS
GRANT SELECT, INSERT ON karda_kb.topic_dossier TO karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.topic_dossier FROM karda_svc;
-- END TOPIC DOSSIER LOCKS
COMMIT;
