BEGIN;
-- BEGIN KNOWLEDGE SERVICES
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL, created_by VARCHAR(128) NOT NULL,
 draft JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','stopped')),
 active_version UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_service_scope ON karda_kb.knowledge_service(workspace_id,id);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service_version (
 id UUID PRIMARY KEY, service_id UUID NOT NULL REFERENCES karda_kb.knowledge_service(id) ON DELETE CASCADE,
 config JSONB NOT NULL, config_hash VARCHAR(64) NOT NULL, created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(service_id,id)
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service_event (
 service_id UUID NOT NULL REFERENCES karda_kb.knowledge_service(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>0), event_id UUID NOT NULL, fingerprint VARCHAR(64) NOT NULL,
 action VARCHAR(16) NOT NULL, note TEXT NOT NULL, result JSONB NOT NULL, created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(service_id,revision), UNIQUE(service_id,event_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service_call (
 request_id UUID PRIMARY KEY, service_id UUID NOT NULL REFERENCES karda_kb.knowledge_service(id) ON DELETE CASCADE,
 version_id UUID, config_hash VARCHAR(64) NOT NULL, caller_sub VARCHAR(128) NOT NULL, caller_product VARCHAR(32) NOT NULL,
 capability VARCHAR(16) NOT NULL CHECK(capability IN ('facts','topics','source','package')), draft BOOLEAN NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'running' CHECK(state IN ('running','succeeded','failed')),
 status INTEGER, error_code VARCHAR(80), latency_ms INTEGER, output_bytes INTEGER,
 steps JSONB NOT NULL DEFAULT '[]', usage JSONB NOT NULL DEFAULT '[]', started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
 CHECK((state='running')=(finished_at IS NULL))
);
CREATE INDEX IF NOT EXISTS knowledge_service_call_page ON karda_kb.knowledge_service_call(service_id,request_id);
-- END KNOWLEDGE SERVICES
-- BEGIN KNOWLEDGE SERVICES LOCKS
REVOKE UPDATE,DELETE ON karda_kb.knowledge_service,karda_kb.knowledge_service_version,karda_kb.knowledge_service_event,karda_kb.knowledge_service_call FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.knowledge_service,karda_kb.knowledge_service_version,karda_kb.knowledge_service_event,karda_kb.knowledge_service_call TO karda_svc;
GRANT UPDATE(draft,revision,state,active_version,updated_at) ON karda_kb.knowledge_service TO karda_svc;
GRANT UPDATE(state,status,error_code,latency_ms,output_bytes,steps,usage,finished_at) ON karda_kb.knowledge_service_call TO karda_svc;
-- END KNOWLEDGE SERVICES LOCKS
COMMIT;
