BEGIN;
-- BEGIN SOURCE MANAGEMENT
CREATE TABLE IF NOT EXISTS karda_kb.source_control_event (
 binding_id UUID NOT NULL REFERENCES karda_kb.binding(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>0), event_id UUID NOT NULL, fingerprint VARCHAR(64) NOT NULL,
 action VARCHAR(32) NOT NULL, note TEXT NOT NULL, result JSONB NOT NULL, created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(binding_id,revision), UNIQUE(binding_id,event_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.source_sync_run (
 id UUID PRIMARY KEY, binding_id UUID NOT NULL REFERENCES karda_kb.binding(id) ON DELETE CASCADE,
 mode VARCHAR(16) NOT NULL CHECK(mode IN ('backfill','incremental')), request_hash VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','attention','done','cancelled')),
 note TEXT NOT NULL, created_by VARCHAR(128) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.source_sync_item (
 id UUID PRIMARY KEY, run_id UUID NOT NULL REFERENCES karda_kb.source_sync_run(id) ON DELETE CASCADE,
 source_doc_id VARCHAR(255) NOT NULL, source_version INTEGER NOT NULL CHECK(source_version>0),
 event VARCHAR(16) NOT NULL CHECK(event IN ('upsert','delete')), title VARCHAR(512) NOT NULL,
 payload JSONB NOT NULL, payload_hash VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','applied','failed','cancelled')),
 attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3), lease_id UUID, lease_until TIMESTAMPTZ,
 document_id UUID, outcome VARCHAR(32), error_code VARCHAR(64), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(run_id,source_doc_id), CHECK((state='running')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)), CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.source_document_head (
 binding_id UUID NOT NULL REFERENCES karda_kb.binding(id) ON DELETE CASCADE, source_doc_id VARCHAR(255) NOT NULL,
 source_version INTEGER NOT NULL CHECK(source_version>0), event VARCHAR(16) NOT NULL CHECK(event IN ('upsert','delete')),
 content_hash VARCHAR(64), document_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(binding_id,source_doc_id)
);
-- END SOURCE MANAGEMENT
-- BEGIN SOURCE MANAGEMENT LOCKS
REVOKE UPDATE, DELETE ON karda_kb.source_control_event,karda_kb.source_sync_run,karda_kb.source_sync_item,karda_kb.source_document_head FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.source_control_event,karda_kb.source_sync_run,karda_kb.source_sync_item,karda_kb.source_document_head TO karda_svc;
GRANT UPDATE(state,updated_at) ON karda_kb.source_sync_run TO karda_svc;
GRANT UPDATE(state,attempt,lease_id,lease_until,document_id,outcome,error_code,updated_at) ON karda_kb.source_sync_item TO karda_svc;
GRANT UPDATE(source_version,event,content_hash,document_id,updated_at) ON karda_kb.source_document_head TO karda_svc;
-- END SOURCE MANAGEMENT LOCKS
COMMIT;
