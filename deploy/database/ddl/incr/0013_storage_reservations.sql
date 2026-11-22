BEGIN;
-- Durable byte reservations. Structure changes run through reviewed db-init only.
CREATE TABLE IF NOT EXISTS karda_kb.stored_object (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  kb_id UUID NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  state VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','deleting','deleted')),
  retain_until TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE UPDATE, DELETE ON karda_kb.stored_object FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.stored_object TO karda_svc;
GRANT UPDATE (state, retain_until, attempts, retry_at, updated_at) ON karda_kb.stored_object TO karda_svc;
CREATE INDEX IF NOT EXISTS idx_stored_object_workspace ON karda_kb.stored_object(workspace_id, state);
CREATE INDEX IF NOT EXISTS idx_stored_object_recovery ON karda_kb.stored_object(retry_at, retain_until);
COMMIT;
