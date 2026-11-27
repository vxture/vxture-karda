BEGIN;
-- BEGIN AUTOMATIC CONNECTORS
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector (
 id UUID PRIMARY KEY,kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),workspace_id UUID NOT NULL,created_by VARCHAR(128) NOT NULL,
 binding_id UUID NOT NULL,config JSONB NOT NULL,config_version UUID NOT NULL,credential_cipher TEXT,
 revision INTEGER NOT NULL DEFAULT 1,state VARCHAR(16) NOT NULL DEFAULT 'paused' CHECK(state IN ('paused','active','deleted')),
 confirmed BOOLEAN NOT NULL DEFAULT false,interval_minutes INTEGER NOT NULL DEFAULT 0,next_due TIMESTAMPTZ,
 cursor TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_version (
 id UUID PRIMARY KEY,connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),config JSONB NOT NULL,config_hash VARCHAR(64) NOT NULL,
 created_by VARCHAR(128) NOT NULL,note TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_run (
 id UUID PRIMARY KEY,connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),config_version UUID NOT NULL,
 mode VARCHAR(16) NOT NULL CHECK(mode IN ('preview','sync')),full_scan BOOLEAN NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'scanning' CHECK(state IN ('scanning','review','applying','done','partial','failed','cancelled')),
 revision INTEGER NOT NULL DEFAULT 1,scan JSONB NOT NULL,apply_offset INTEGER NOT NULL DEFAULT 0,
 current_batch JSONB,heads_hash VARCHAR(64) NOT NULL,deletions JSONB NOT NULL DEFAULT '[]',deletion_state VARCHAR(16) NOT NULL DEFAULT 'pending',
 lease_id UUID,lease_until TIMESTAMPTZ,attempt INTEGER NOT NULL DEFAULT 0,error_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_head (
 connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),source_key VARCHAR(80) NOT NULL,url TEXT NOT NULL,title VARCHAR(512) NOT NULL,
 content_hash VARCHAR(64),etag TEXT,modified TEXT,deleted BOOLEAN NOT NULL DEFAULT false,
 source_version INTEGER NOT NULL DEFAULT 0,document_id UUID,last_run UUID NOT NULL,
 PRIMARY KEY(connector_id,source_key)
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_event (
 connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),revision INTEGER NOT NULL,request_id UUID NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,result JSONB NOT NULL,created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(connector_id,revision),UNIQUE(connector_id,request_id)
);
-- END AUTOMATIC CONNECTORS
-- BEGIN AUTOMATIC CONNECTOR LOCKS
REVOKE UPDATE,DELETE ON karda_kb.automatic_connector,karda_kb.automatic_connector_version,karda_kb.automatic_connector_run,karda_kb.automatic_connector_head,karda_kb.automatic_connector_event FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.automatic_connector,karda_kb.automatic_connector_version,karda_kb.automatic_connector_run,karda_kb.automatic_connector_head,karda_kb.automatic_connector_event TO karda_svc;
GRANT UPDATE(config,config_version,credential_cipher,revision,state,confirmed,interval_minutes,next_due,cursor,updated_at) ON karda_kb.automatic_connector TO karda_svc;
GRANT UPDATE(state,revision,scan,apply_offset,current_batch,deletions,deletion_state,lease_id,lease_until,attempt,error_code,updated_at) ON karda_kb.automatic_connector_run TO karda_svc;
GRANT UPDATE(url,title,content_hash,etag,modified,deleted,source_version,document_id,last_run) ON karda_kb.automatic_connector_head TO karda_svc;
-- END AUTOMATIC CONNECTOR LOCKS
COMMIT;
