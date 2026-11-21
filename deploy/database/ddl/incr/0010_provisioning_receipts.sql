-- db-init only; never run from application startup.
BEGIN;
ALTER TABLE vx_provision.webhook_delivery ADD COLUMN IF NOT EXISTS payload_hash VARCHAR(64);
-- Immutable scope recovered only from signed events / verified read reconciliation.
CREATE TABLE IF NOT EXISTS vx_provision.provision_anchor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  product_code VARCHAR(32) NOT NULL,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_provision_anchor_ws_product UNIQUE (workspace_id, product_code)
);
GRANT SELECT, INSERT ON vx_provision.provision_anchor TO karda_svc;
REVOKE UPDATE, DELETE ON vx_provision.provision_anchor FROM karda_svc;
COMMIT;
