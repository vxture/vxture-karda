BEGIN;
-- BEGIN PRODUCTION CENTER
CREATE TABLE IF NOT EXISTS karda_kb.production_plan (
 id UUID PRIMARY KEY,workspace_id UUID NOT NULL,created_by VARCHAR(128) NOT NULL,title VARCHAR(200) NOT NULL,
 extract_missing BOOLEAN NOT NULL,request_hash VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','paused','cancelled')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.production_unit (
 id UUID PRIMARY KEY,plan_id UUID NOT NULL REFERENCES karda_kb.production_plan(id) ON DELETE CASCADE,
 kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,manifest JSONB NOT NULL,config_hash VARCHAR(64) NOT NULL,
 compile_task_id UUID NOT NULL,UNIQUE(plan_id,kb_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.production_step (
 id UUID PRIMARY KEY,unit_id UUID NOT NULL REFERENCES karda_kb.production_unit(id) ON DELETE CASCADE,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('process','extract','compile','publish')),document_id UUID,payload JSONB NOT NULL DEFAULT '{}',
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','waiting','review','done','failed','cancelled')),
 attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3),lease_id UUID,lease_until TIMESTAMPTZ,
 receipt JSONB NOT NULL DEFAULT '{}',error_code VARCHAR(80),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((state='running')=(lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.production_event (
 plan_id UUID NOT NULL REFERENCES karda_kb.production_plan(id) ON DELETE CASCADE,revision INTEGER NOT NULL,event_id UUID NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,result JSONB NOT NULL,
 created_by VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(plan_id,revision),UNIQUE(plan_id,event_id)
);
-- END PRODUCTION CENTER
-- BEGIN PRODUCTION CENTER LOCKS
REVOKE UPDATE,DELETE ON karda_kb.production_plan,karda_kb.production_unit,karda_kb.production_step,karda_kb.production_event FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.production_plan,karda_kb.production_unit,karda_kb.production_step,karda_kb.production_event TO karda_svc;
GRANT UPDATE(state,revision,updated_at) ON karda_kb.production_plan TO karda_svc;
GRANT UPDATE(state,attempt,lease_id,lease_until,receipt,error_code,updated_at) ON karda_kb.production_step TO karda_svc;
-- END PRODUCTION CENTER LOCKS
COMMIT;
