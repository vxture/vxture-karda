-- db-init only: retained failures with bounded automatic retries.
BEGIN;
ALTER TABLE local_usage.raw ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE local_usage.raw ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE local_usage.raw ADD COLUMN IF NOT EXISTS last_error VARCHAR(200);
ALTER TABLE local_usage.raw ADD COLUMN IF NOT EXISTS flushed_at TIMESTAMPTZ;
GRANT UPDATE (flushed, attempts, next_attempt_at, last_error, flushed_at) ON local_usage.raw TO karda_svc;
COMMIT;
