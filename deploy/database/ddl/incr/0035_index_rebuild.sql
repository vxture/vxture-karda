BEGIN;
-- BEGIN INDEX REBUILD
CREATE TABLE IF NOT EXISTS karda_kb.index_rebuild (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  created_by VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  params JSONB NOT NULL CHECK (jsonb_typeof(params)='object'),
  embedding_model VARCHAR(128),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  state VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK (state IN ('planned','active','reverted','cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.index_rebuild_item (
  run_id UUID NOT NULL REFERENCES karda_kb.index_rebuild(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version>0),
  content_hash VARCHAR(64) NOT NULL,
  text_hash VARCHAR(64) NOT NULL,
  baseline_hash VARCHAR(64) NOT NULL,
  baseline JSONB NOT NULL CHECK (jsonb_typeof(baseline)='array' AND jsonb_array_length(baseline) BETWEEN 1 AND 1000),
  state VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK (state IN ('planned','running','ready','failed')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  candidate JSONB CHECK (jsonb_typeof(candidate)='array' AND jsonb_array_length(candidate) BETWEEN 1 AND 1000),
  candidate_hash VARCHAR(64),
  error_code VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,document_id),
  CHECK ((state='running')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((lease_id IS NULL)=(lease_until IS NULL)),
  CHECK ((state='ready')=(candidate IS NOT NULL AND candidate_hash IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.index_rebuild_event (
  run_id UUID NOT NULL REFERENCES karda_kb.index_rebuild(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('activate','revert','cancel')),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,revision),
  UNIQUE(run_id,event_id)
);
-- END INDEX REBUILD
-- BEGIN INDEX REBUILD LOCKS
REVOKE UPDATE, DELETE ON karda_kb.index_rebuild, karda_kb.index_rebuild_item, karda_kb.index_rebuild_event FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.index_rebuild, karda_kb.index_rebuild_item, karda_kb.index_rebuild_event TO karda_svc;
GRANT UPDATE (state,revision,updated_at) ON karda_kb.index_rebuild TO karda_svc;
GRANT UPDATE (state,attempt,lease_id,lease_until,candidate,candidate_hash,error_code,updated_at) ON karda_kb.index_rebuild_item TO karda_svc;
-- END INDEX REBUILD LOCKS
COMMIT;
