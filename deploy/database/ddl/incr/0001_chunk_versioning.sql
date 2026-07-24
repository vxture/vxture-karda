-- 0001_chunk_versioning.sql - atomic-replace versioning for chunks.
--
-- The AUTHORITATIVE definition (a fresh apply + the data-architecture guardrail)
-- lives in 00_baseline.sql; this file mirrors it as idempotent ALTERs so a LIVE
-- database that already has the pre-versioning chunk table adopts the change via
-- db-init without a destructive reset.
--
-- Change: document gains active_chunk_version (the version retrieval reads);
-- chunk gains version, and its uniqueness moves from (document_id, ordinal) to
-- (document_id, version, ordinal) so two versions can coexist during a swap.
--
-- Idempotent: safe to re-run.

ALTER TABLE karda_kb.document
  ADD COLUMN IF NOT EXISTS active_chunk_version INTEGER;

-- Backfill version on any existing rows to 1, then make it NOT NULL. A live DB
-- reaching this increment predates versioning, so all existing chunks are v1.
ALTER TABLE karda_kb.chunk
  ADD COLUMN IF NOT EXISTS version INTEGER;
UPDATE karda_kb.chunk SET version = 1 WHERE version IS NULL;
ALTER TABLE karda_kb.chunk
  ALTER COLUMN version SET NOT NULL;

-- Swap the uniqueness constraint. Drop the old (document_id, ordinal) and add
-- (document_id, version, ordinal). Guarded so a re-run is a no-op.
ALTER TABLE karda_kb.chunk
  DROP CONSTRAINT IF EXISTS uidx_chunk_document_ordinal;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uidx_chunk_document_version_ordinal'
  ) THEN
    ALTER TABLE karda_kb.chunk
      ADD CONSTRAINT uidx_chunk_document_version_ordinal
      UNIQUE (document_id, version, ordinal);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_chunk_active
  ON karda_kb.chunk (document_id, version);
