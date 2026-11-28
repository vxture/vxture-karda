BEGIN;
ALTER TABLE karda_kb.public_library ADD COLUMN IF NOT EXISTS distribution JSONB;
ALTER TABLE karda_kb.public_release ADD COLUMN IF NOT EXISTS catalog JSONB;
CREATE TABLE IF NOT EXISTS karda_kb.public_binding (
 workspace_id UUID NOT NULL,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),enabled BOOLEAN NOT NULL,mode VARCHAR(16) NOT NULL CHECK(mode IN ('current','pinned')),release_id UUID REFERENCES karda_kb.public_release(id),member_rule JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),updated_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,library_id),CHECK((mode='current' AND release_id IS NULL) OR (mode='pinned' AND release_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.public_binding_event (
 workspace_id UUID NOT NULL,event_id UUID NOT NULL,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),fingerprint VARCHAR(64) NOT NULL,result JSONB NOT NULL,note TEXT NOT NULL,created_by VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,event_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.public_delivery (
 request_id UUID PRIMARY KEY,workspace_id UUID NOT NULL,caller_sub VARCHAR(128) NOT NULL,caller_product VARCHAR(32) NOT NULL,mode VARCHAR(16) NOT NULL,versions JSONB NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'running',status INTEGER,result_count INTEGER,error_code VARCHAR(80),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS public_delivery_workspace ON karda_kb.public_delivery(workspace_id,created_at DESC);
CREATE TABLE IF NOT EXISTS karda_kb.public_feedback (
 id UUID PRIMARY KEY,workspace_id UUID NOT NULL,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),release_id UUID NOT NULL REFERENCES karda_kb.public_release(id),artifact_id UUID,request_id UUID,kind VARCHAR(24) NOT NULL CHECK(kind IN ('correction','no_evidence','outdated','delivery_error')),message TEXT NOT NULL,created_by VARCHAR(128) NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'open' CHECK(state IN ('open','triaged','resolved','dismissed')),resolution TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,updated_by VARCHAR(128),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT,INSERT ON karda_kb.public_binding,karda_kb.public_binding_event,karda_kb.public_delivery,karda_kb.public_feedback TO karda_svc;
REVOKE UPDATE,DELETE ON karda_kb.public_binding,karda_kb.public_binding_event,karda_kb.public_delivery,karda_kb.public_feedback FROM karda_svc;
GRANT UPDATE(enabled,mode,release_id,member_rule,revision,updated_by,updated_at) ON karda_kb.public_binding TO karda_svc;
GRANT UPDATE(state,status,result_count,error_code,finished_at) ON karda_kb.public_delivery TO karda_svc;
GRANT UPDATE(state,resolution,revision,updated_by,updated_at) ON karda_kb.public_feedback TO karda_svc;
GRANT UPDATE(distribution) ON karda_kb.public_library TO karda_svc;
COMMIT;
