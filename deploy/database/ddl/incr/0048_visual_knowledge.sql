BEGIN;
ALTER TABLE karda_kb.knowledge_service_call DROP CONSTRAINT IF EXISTS knowledge_service_call_capability_check;
ALTER TABLE karda_kb.knowledge_service_call ADD CONSTRAINT knowledge_service_call_capability_check CHECK(capability IN ('facts','topics','source','package','context','visual'));
-- BEGIN VISUAL KNOWLEDGE
CREATE TABLE IF NOT EXISTS karda_kb.visual_run (
 id UUID PRIMARY KEY,kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),workspace_id UUID NOT NULL,
 document_id UUID NOT NULL REFERENCES karda_kb.document(id),source_hash VARCHAR(64) NOT NULL,source_version INTEGER NOT NULL,
 created_by VARCHAR(128) NOT NULL,config JSONB NOT NULL,manifest JSONB NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK(state IN ('planned','active','paused','cancelled','review','completed')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),coverage JSONB NOT NULL DEFAULT '{}',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.visual_asset (
 id UUID PRIMARY KEY,run_id UUID NOT NULL REFERENCES karda_kb.visual_run(id),kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
 ordinal INTEGER NOT NULL,locator JSONB NOT NULL,draft JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','ready','failed','unknown','accepted','rejected')),
 active_version UUID,image_ref TEXT,image_hash VARCHAR(64),image_bytes INTEGER,width INTEGER,height INTEGER,
 lease_id UUID,lease_until TIMESTAMPTZ,attempt INTEGER NOT NULL DEFAULT 0,error_code VARCHAR(80),request_key VARCHAR(200),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(run_id,ordinal)
);
CREATE TABLE IF NOT EXISTS karda_kb.visual_revision (
 id UUID PRIMARY KEY,asset_id UUID NOT NULL REFERENCES karda_kb.visual_asset(id) ON DELETE CASCADE,kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
 revision INTEGER NOT NULL,payload JSONB NOT NULL,payload_hash VARCHAR(64) NOT NULL,decision VARCHAR(16) NOT NULL,
 created_by VARCHAR(128) NOT NULL,note TEXT NOT NULL,derived_document UUID REFERENCES karda_kb.document(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(asset_id,revision)
);
CREATE TABLE IF NOT EXISTS karda_kb.visual_event (
 run_id UUID NOT NULL REFERENCES karda_kb.visual_run(id),revision INTEGER NOT NULL,request_id UUID NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,result JSONB NOT NULL,created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(run_id,revision),UNIQUE(run_id,request_id)
);
-- END VISUAL KNOWLEDGE
-- BEGIN VISUAL KNOWLEDGE LOCKS
REVOKE UPDATE,DELETE ON karda_kb.visual_run,karda_kb.visual_asset,karda_kb.visual_revision,karda_kb.visual_event FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.visual_run,karda_kb.visual_asset,karda_kb.visual_revision,karda_kb.visual_event TO karda_svc;
GRANT UPDATE(state,revision,coverage,updated_at) ON karda_kb.visual_run TO karda_svc;
GRANT UPDATE(draft,revision,state,active_version,image_ref,image_hash,image_bytes,width,height,lease_id,lease_until,attempt,error_code,request_key,updated_at) ON karda_kb.visual_asset TO karda_svc;
GRANT UPDATE(derived_document) ON karda_kb.visual_revision TO karda_svc;
-- END VISUAL KNOWLEDGE LOCKS
COMMIT;
