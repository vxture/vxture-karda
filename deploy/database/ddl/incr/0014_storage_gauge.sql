BEGIN;
CREATE TABLE IF NOT EXISTS karda_kb.storage_watermark (
  workspace_id UUID PRIMARY KEY,
  value BIGINT NOT NULL CHECK (value >= 0),
  observed_at TIMESTAMPTZ NOT NULL,
  pending BOOLEAN NOT NULL DEFAULT true,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  retry_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON karda_kb.storage_watermark FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.storage_watermark TO karda_svc;
GRANT UPDATE (value, observed_at, pending, attempts, retry_at) ON karda_kb.storage_watermark TO karda_svc;
COMMIT;
