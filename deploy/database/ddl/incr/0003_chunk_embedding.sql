-- 0003_chunk_embedding.sql - the in-Postgres vector index store (ADR-002).
--
-- The AUTHORITATIVE definition (a fresh apply + the data-architecture guardrail)
-- lives in 00_baseline.sql; this file mirrors it so a LIVE database adopts the
-- table via db-init without a destructive reset.
--
-- Change: karda_kb.chunk_embedding - one row per embedded chunk, written in the
-- same transaction as the chunk-version commit (commit.ts). model_code is the
-- KD-107 vector-space lock; vectors are JSONB float arrays and similarity runs
-- in-process (pgvector is the named scale path, behind the same VectorCorpus
-- port). Deletes ride the chunk FK cascade, so atomic-replace needs no extra
-- statement.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS karda_kb.chunk_embedding (
  chunk_id    UUID PRIMARY KEY,
  model_code  VARCHAR(128) NOT NULL,
  dim         INTEGER NOT NULL,
  vector      JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_chunk_embedding_chunk FOREIGN KEY (chunk_id)
    REFERENCES karda_kb.chunk (id) ON DELETE CASCADE
);

-- Service-role grants travel with the increment that adds the table (the same
-- pattern as incr/0002): on a live DB 97_service_role's ALL-TABLES grant ran
-- before this table existed. Same posture as chunk: SELECT/INSERT/DELETE, no
-- UPDATE - embeddings are rebuilt, never edited in place.
GRANT SELECT, INSERT, DELETE ON karda_kb.chunk_embedding TO karda_svc;
