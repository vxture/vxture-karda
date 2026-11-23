BEGIN;

CREATE TABLE IF NOT EXISTS local_authz.owner_anchor (
  workspace_id UUID PRIMARY KEY,
  member_id UUID NOT NULL UNIQUE REFERENCES local_authz.member(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_authz.role_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  target_sub VARCHAR(128) NOT NULL,
  action VARCHAR(64) NOT NULL,
  roles_before JSONB NOT NULL,
  roles_after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalogs are product-owned; runtime may assign roles, not rewrite policy.
INSERT INTO local_authz.role(role_code,name) VALUES ('owner','owner') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('administrator','administrator') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('member','member') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('readonly','readonly') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('guest','guest') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('product.enter','product.enter') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('data.read','data.read') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('data.write','data.write') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('data.export','data.export') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('ai.use','ai.use') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('service.publish','service.publish') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('members.manage','members.manage') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('product.manage','product.manage') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('ownership.transfer','ownership.transfer') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('guest.read','guest.read') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='data.write' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='data.export' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='ai.use' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='service.publish' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='members.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='product.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='ownership.transfer' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='guest.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='data.write' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='data.export' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='ai.use' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='service.publish' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='members.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='product.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='guest.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='data.write' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='data.export' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='ai.use' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='service.publish' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='readonly' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='readonly' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='guest' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='guest' AND p.perm_code='guest.read' ON CONFLICT (role_id,permission_id) DO NOTHING;

GRANT USAGE ON SCHEMA local_authz TO karda_svc;
GRANT SELECT, INSERT ON local_authz.member TO karda_svc;
GRANT SELECT, INSERT, DELETE ON local_authz.member_role, local_authz.owner_anchor TO karda_svc;
REVOKE DELETE ON local_authz.member FROM karda_svc;
GRANT SELECT, INSERT ON local_authz.role_audit TO karda_svc;
GRANT SELECT ON local_authz.role, local_authz.permission, local_authz.role_permission TO karda_svc;
REVOKE INSERT, UPDATE, DELETE ON local_authz.role, local_authz.permission, local_authz.role_permission FROM karda_svc;
REVOKE UPDATE ON local_authz.member, local_authz.member_role, local_authz.owner_anchor FROM karda_svc;
GRANT UPDATE (display_name, avatar_hash, status, updated_at) ON local_authz.member TO karda_svc;
REVOKE UPDATE, DELETE ON local_authz.role_audit FROM karda_svc;
COMMIT;
