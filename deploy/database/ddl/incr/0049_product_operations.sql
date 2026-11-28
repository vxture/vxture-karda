BEGIN;
CREATE TABLE IF NOT EXISTS karda_kb.ops_member (
 sub VARCHAR(128) PRIMARY KEY CHECK(sub ~ '^opr_[a-fA-F0-9-]{36},roles JSONB NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),revision INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.ops_audit (
 id UUID PRIMARY KEY,actor_sub VARCHAR(128) NOT NULL,action VARCHAR(64) NOT NULL,target VARCHAR(128) NOT NULL,note TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_library (
 id UUID PRIMARY KEY,product_code VARCHAR(32) NOT NULL DEFAULT 'karda' CHECK(product_code='karda'),title VARCHAR(255) NOT NULL,domain VARCHAR(64) NOT NULL,description TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','approved','published','withdrawn')),reviewed_hash VARCHAR(64),reviewed_by VARCHAR(128),active_release UUID,created_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_artifact (
 id UUID PRIMARY KEY,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),kind VARCHAR(16) NOT NULL CHECK(kind IN ('source','item','relation')),payload JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_release (
 id UUID PRIMARY KEY,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),content_hash VARCHAR(64) NOT NULL,snapshot JSONB NOT NULL,reviewed_by VARCHAR(128) NOT NULL,created_by VARCHAR(128) NOT NULL,restored_from UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_job (
 id UUID PRIMARY KEY,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),source_id UUID NOT NULL REFERENCES karda_kb.public_artifact(id),source_revision INTEGER NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','done','failed','cancelled')),result JSONB NOT NULL DEFAULT '{}',error_code VARCHAR(80),attempt INTEGER NOT NULL DEFAULT 0,created_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE UPDATE,DELETE ON karda_kb.ops_member,karda_kb.ops_audit,karda_kb.public_library,karda_kb.public_artifact,karda_kb.public_release,karda_kb.public_job FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.ops_member,karda_kb.ops_audit,karda_kb.public_library,karda_kb.public_artifact,karda_kb.public_release,karda_kb.public_job TO karda_svc;
GRANT UPDATE(roles,status,revision,updated_at) ON karda_kb.ops_member TO karda_svc;
GRANT UPDATE(title,domain,description,revision,state,reviewed_hash,reviewed_by,active_release,updated_at) ON karda_kb.public_library TO karda_svc;
GRANT UPDATE(payload,revision,updated_at) ON karda_kb.public_artifact TO karda_svc;
GRANT UPDATE(state,result,error_code,attempt,updated_at) ON karda_kb.public_job TO karda_svc;
COMMIT;
),roles JSONB NOT NULL,status VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),revision INTEGER NOT NULL DEFAULT 1,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.ops_audit (
 id UUID PRIMARY KEY,actor_sub VARCHAR(128) NOT NULL,action VARCHAR(64) NOT NULL,target VARCHAR(128) NOT NULL,note TEXT NOT NULL,payload JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_library (
 id UUID PRIMARY KEY,product_code VARCHAR(32) NOT NULL DEFAULT 'karda' CHECK(product_code='karda'),title VARCHAR(255) NOT NULL,domain VARCHAR(64) NOT NULL,description TEXT NOT NULL DEFAULT '',revision INTEGER NOT NULL DEFAULT 1,state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','approved','published','withdrawn')),reviewed_hash VARCHAR(64),reviewed_by VARCHAR(128),active_release UUID,created_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_artifact (
 id UUID PRIMARY KEY,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),kind VARCHAR(16) NOT NULL CHECK(kind IN ('source','item','relation')),payload JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_release (
 id UUID PRIMARY KEY,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),content_hash VARCHAR(64) NOT NULL,snapshot JSONB NOT NULL,reviewed_by VARCHAR(128) NOT NULL,created_by VARCHAR(128) NOT NULL,restored_from UUID,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.public_job (
 id UUID PRIMARY KEY,library_id UUID NOT NULL REFERENCES karda_kb.public_library(id),source_id UUID NOT NULL REFERENCES karda_kb.public_artifact(id),source_revision INTEGER NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','done','failed','cancelled')),result JSONB NOT NULL DEFAULT '{}',error_code VARCHAR(80),attempt INTEGER NOT NULL DEFAULT 0,created_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE UPDATE,DELETE ON karda_kb.ops_member,karda_kb.ops_audit,karda_kb.public_library,karda_kb.public_artifact,karda_kb.public_release,karda_kb.public_job FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.ops_member,karda_kb.ops_audit,karda_kb.public_library,karda_kb.public_artifact,karda_kb.public_release,karda_kb.public_job TO karda_svc;
GRANT UPDATE(roles,status,revision,updated_at) ON karda_kb.ops_member TO karda_svc;
GRANT UPDATE(title,domain,description,revision,state,reviewed_hash,reviewed_by,active_release,updated_at) ON karda_kb.public_library TO karda_svc;
GRANT UPDATE(payload,revision,updated_at) ON karda_kb.public_artifact TO karda_svc;
GRANT UPDATE(state,result,error_code,attempt,updated_at) ON karda_kb.public_job TO karda_svc;
COMMIT;
