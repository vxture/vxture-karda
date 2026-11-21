BEGIN;
-- Same-transaction invalidation outbox. Apply through db-init only.
CREATE TABLE IF NOT EXISTS vx_provision.access_revision (
  workspace_id UUID PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  published_generation BIGINT NOT NULL DEFAULT 0 CHECK (published_generation >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON vx_provision.access_revision TO karda_svc;
REVOKE UPDATE, DELETE ON vx_provision.access_revision FROM karda_svc;
GRANT UPDATE (generation, published_generation, updated_at) ON vx_provision.access_revision TO karda_svc;
COMMIT;
