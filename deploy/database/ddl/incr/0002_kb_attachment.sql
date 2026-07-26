-- 0002_kb_attachment.sql - the per-user, per-product library attachment list.
--
-- The AUTHORITATIVE definition (a fresh apply + the data-architecture guardrail)
-- lives in 00_baseline.sql; this file mirrors it as an idempotent CREATE so a LIVE
-- database adopts the new table via db-init without a destructive reset.
--
-- New table karda_kb.kb_attachment (definition 4.8; karda.attach_kb / detach_kb /
-- create_kb auto-attach): a user's working-set link to a library for one product.
-- The permission unit is the library, not this row - a link here is a working-set
-- membership, not an authorization grant. Insert/delete only.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS karda_kb.kb_attachment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,
  user_sub      VARCHAR(128) NOT NULL,
  product_code  VARCHAR(32) NOT NULL,
  kb_id         UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_kb_attachment_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  CONSTRAINT uidx_kb_attachment_ws_user_product_kb
    UNIQUE (workspace_id, user_sub, product_code, kb_id)
);
CREATE INDEX IF NOT EXISTS idx_kb_attachment_lookup
  ON karda_kb.kb_attachment (workspace_id, user_sub, product_code);

-- Service-role grants for the new table. 97_service_role.sql grants
-- SELECT/INSERT/DELETE via `ON ALL TABLES IN SCHEMA karda_kb`, but that runs
-- BEFORE the increments, so it does not cover a table added here - the grant must
-- travel with the increment (incr/README.md). Insert/delete only, no UPDATE:
-- attach and detach are the only operations. Idempotent (GRANT is a no-op if
-- already held). The karda_svc role is created by 97_service_role.sql.
GRANT SELECT, INSERT, DELETE ON karda_kb.kb_attachment TO karda_svc;
