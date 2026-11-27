BEGIN;
-- BEGIN ENTITY CONSISTENCY
CREATE TABLE IF NOT EXISTS karda_kb.identity_head (
 kb_id UUID PRIMARY KEY REFERENCES karda_kb.knowledge_base(id),workspace_id UUID NOT NULL,
 draft JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),active_version UUID,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.identity_version (
 id UUID PRIMARY KEY,kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),config JSONB NOT NULL,
 config_hash VARCHAR(64) NOT NULL,created_by VARCHAR(128) NOT NULL,note TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(kb_id,id)
);
CREATE TABLE IF NOT EXISTS karda_kb.identity_control (
 kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),revision INTEGER NOT NULL CHECK(revision>0),
 request_id UUID NOT NULL,fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,
 result JSONB NOT NULL,created_by VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(kb_id,revision),UNIQUE(kb_id,request_id)
);
-- END ENTITY CONSISTENCY
-- BEGIN ENTITY CONSISTENCY LOCKS
REVOKE UPDATE,DELETE ON karda_kb.identity_head,karda_kb.identity_version,karda_kb.identity_control FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.identity_head,karda_kb.identity_version,karda_kb.identity_control TO karda_svc;
GRANT UPDATE(draft,revision,active_version,updated_at) ON karda_kb.identity_head TO karda_svc;
-- END ENTITY CONSISTENCY LOCKS
DROP INDEX IF EXISTS karda_kb.uidx_entity_kb_kind_name;
COMMIT;
