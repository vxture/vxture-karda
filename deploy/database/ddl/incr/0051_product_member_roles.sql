BEGIN;
CREATE TABLE IF NOT EXISTS karda_kb.ops_platform_member (
 sub VARCHAR(128) PRIMARY KEY,platform_role VARCHAR(16) NOT NULL CHECK(platform_role IN ('owner','member')),active BOOLEAN NOT NULL,display_name VARCHAR(255) NOT NULL DEFAULT '',authority_version VARCHAR(40) NOT NULL,environment VARCHAR(32) NOT NULL,observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.ops_role (
 id UUID PRIMARY KEY,code VARCHAR(64) NOT NULL UNIQUE,name VARCHAR(128) NOT NULL,description TEXT NOT NULL DEFAULT '',system BOOLEAN NOT NULL DEFAULT false,state VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(state IN ('active','disabled','archived')),revision INTEGER NOT NULL DEFAULT 1,permissions JSONB NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.ops_role_version (
 role_id UUID NOT NULL REFERENCES karda_kb.ops_role(id),revision INTEGER NOT NULL,definition JSONB NOT NULL,created_by VARCHAR(128) NOT NULL,note TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(role_id,revision)
);
CREATE TABLE IF NOT EXISTS karda_kb.ops_role_assignment (
 id UUID PRIMARY KEY,sub VARCHAR(128) NOT NULL,role_id UUID NOT NULL REFERENCES karda_kb.ops_role(id),scope JSONB NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'active' CHECK(state IN ('active','suspended','legacy')),revision INTEGER NOT NULL DEFAULT 1,created_by VARCHAR(128) NOT NULL,updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(sub,role_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.ops_authorization_receipt (
 request_id UUID PRIMARY KEY,created_by VARCHAR(128) NOT NULL,fingerprint VARCHAR(64) NOT NULL,result JSONB NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO karda_kb.ops_role(id,code,name,system,permissions) VALUES('00000000-0000-4000-9000-000000000001','editor','editor',true,'["operations.enter","content.read","content.edit","source.manage","production.manage","graph.manage"]') ON CONFLICT(code) DO NOTHING;
INSERT INTO karda_kb.ops_role(id,code,name,system,permissions) VALUES('00000000-0000-4000-9000-000000000002','reviewer','reviewer',true,'["operations.enter","content.read","content.review"]') ON CONFLICT(code) DO NOTHING;
INSERT INTO karda_kb.ops_role(id,code,name,system,permissions) VALUES('00000000-0000-4000-9000-000000000003','publisher','publisher',true,'["operations.enter","content.read","content.publish","graph.manage"]') ON CONFLICT(code) DO NOTHING;
INSERT INTO karda_kb.ops_role(id,code,name,system,permissions) VALUES('00000000-0000-4000-9000-000000000004','reader','reader',true,'["operations.enter","content.read"]') ON CONFLICT(code) DO NOTHING;
INSERT INTO karda_kb.ops_role(id,code,name,system,permissions) VALUES('00000000-0000-4000-9000-000000000005','librarian','librarian',true,'["operations.enter","content.read","library.manage","taxonomy.manage","source.manage","production.manage"]') ON CONFLICT(code) DO NOTHING;
INSERT INTO karda_kb.ops_role(id,code,name,system,permissions) VALUES('00000000-0000-4000-9000-000000000006','auditor','auditor',true,'["operations.enter","audit.read"]') ON CONFLICT(code) DO NOTHING;
INSERT INTO karda_kb.ops_role_assignment(id,sub,role_id,scope,state,created_by)
 SELECT gen_random_uuid(),m.sub,r.id,'{"type":"product"}','legacy','migration:0051' FROM karda_kb.ops_member m JOIN karda_kb.ops_role r ON m.roles ? r.code ON CONFLICT(sub,role_id) DO NOTHING;
REVOKE UPDATE,DELETE ON karda_kb.ops_platform_member,karda_kb.ops_role,karda_kb.ops_role_version,karda_kb.ops_role_assignment,karda_kb.ops_authorization_receipt FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.ops_platform_member,karda_kb.ops_role,karda_kb.ops_role_version,karda_kb.ops_role_assignment,karda_kb.ops_authorization_receipt TO karda_svc;
GRANT UPDATE(platform_role,active,display_name,authority_version,environment,observed_at) ON karda_kb.ops_platform_member TO karda_svc;
GRANT UPDATE(name,description,state,revision,permissions,updated_at) ON karda_kb.ops_role TO karda_svc;
GRANT UPDATE(scope,state,revision,created_by,updated_at) ON karda_kb.ops_role_assignment TO karda_svc;
COMMIT;
