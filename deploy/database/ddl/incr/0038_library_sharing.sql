BEGIN;
-- BEGIN LIBRARY SHARING
CREATE TABLE IF NOT EXISTS karda_kb.library_sharing_event (
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  before_state VARCHAR(32) NOT NULL CHECK (before_state IN ('private','ws_published','org_published')),
  after_state VARCHAR(32) NOT NULL CHECK (after_state IN ('private','ws_published','org_published')),
  impact JSONB NOT NULL CHECK (jsonb_typeof(impact)='object'),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,revision),
  UNIQUE(kb_id,event_id)
);
-- END LIBRARY SHARING
-- BEGIN LIBRARY SHARING LOCKS
REVOKE UPDATE, DELETE ON karda_kb.library_sharing_event FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.library_sharing_event TO karda_svc;
-- END LIBRARY SHARING LOCKS
COMMIT;
