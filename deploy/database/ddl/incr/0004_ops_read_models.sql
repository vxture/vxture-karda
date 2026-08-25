-- 0004_ops_read_models.sql - the ops read-model tables (240-ops-read-models).
--
-- The AUTHORITATIVE definition (a fresh apply + the data-architecture guardrail)
-- lives in 00_baseline.sql; this file mirrors it so a LIVE database adopts the
-- tables via db-init without a destructive reset.
--
-- Change: four brand-new tables in karda_kb -
--   processing_task        one document through the five stages (110-processing)
--   processing_task_stage  one row per (task, stage); stage P95 and the progress dots
--   supply_call            append-only ledger of served calls (both channels)
--   supply_call_asset      per-asset citation attribution for one call
--
-- Why they exist: three of the four portal domains queried NO database at all -
-- every task and every call on those pages was a demo constant (240 section 1).
--
-- Both the service-role grants AND the column-lock whitelist travel with this
-- increment, because db-init applies baseline -> 97 -> 98 -> incr/*, so neither
-- 97's ON ALL TABLES grant nor 98's column locks can see a table added here
-- (incr/README.md).
--
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------- structure --

CREATE TABLE IF NOT EXISTS karda_kb.processing_task (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL,
  kb_id               UUID NOT NULL,
  tier                VARCHAR(32) NOT NULL DEFAULT 'interactive'
                        CONSTRAINT chk_processing_task_tier
                        CHECK (tier IN ('interactive', 'sync', 'bulk')),
  state               VARCHAR(32) NOT NULL DEFAULT 'queued'
                        CONSTRAINT chk_processing_task_state
                        CHECK (state IN ('queued', 'running', 'suspended', 'failed', 'done')),
  current_stage       VARCHAR(32) NOT NULL DEFAULT 'fetch'
                        CONSTRAINT chk_processing_task_stage
                        CHECK (current_stage IN ('fetch', 'parse', 'chunk', 'embed', 'commit')),
  failure_class       VARCHAR(32)
                        CONSTRAINT chk_processing_task_failure_class
                        CHECK (failure_class IN ('transient', 'permanent', 'quota')),
  failure_reason      TEXT,
  attempt             INTEGER NOT NULL DEFAULT 1,
  created_in_product  VARCHAR(32),
  created_by          VARCHAR(128),
  queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_processing_task_document FOREIGN KEY (document_id)
    REFERENCES karda_kb.document (id) ON DELETE CASCADE,
  CONSTRAINT fk_processing_task_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_processing_task_doc_live
  ON karda_kb.processing_task (document_id)
  WHERE state IN ('queued', 'running');
CREATE INDEX IF NOT EXISTS idx_processing_task_kb_state
  ON karda_kb.processing_task (kb_id, state);
CREATE INDEX IF NOT EXISTS idx_processing_task_state_queued
  ON karda_kb.processing_task (state, queued_at);
CREATE INDEX IF NOT EXISTS idx_processing_task_kb_finished
  ON karda_kb.processing_task (kb_id, finished_at);

CREATE TABLE IF NOT EXISTS karda_kb.processing_task_stage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL,
  stage       VARCHAR(32) NOT NULL
                CONSTRAINT chk_processing_task_stage_stage
                CHECK (stage IN ('fetch', 'parse', 'chunk', 'embed', 'commit')),
  outcome     VARCHAR(32)
                CONSTRAINT chk_processing_task_stage_outcome
                CHECK (outcome IN ('ok', 'failed', 'skipped', 'ai_assisted')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_processing_task_stage_task FOREIGN KEY (task_id)
    REFERENCES karda_kb.processing_task (id) ON DELETE CASCADE,
  CONSTRAINT uidx_processing_task_stage UNIQUE (task_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_processing_task_stage_p95
  ON karda_kb.processing_task_stage (stage, ended_at);

CREATE TABLE IF NOT EXISTS karda_kb.supply_call (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel        VARCHAR(32) NOT NULL
                   CONSTRAINT chk_supply_call_channel
                   CHECK (channel IN ('direct', 'runos')),
  capability     VARCHAR(64) NOT NULL,
  operation      VARCHAR(64) NOT NULL,
  consumer_code  VARCHAR(64),
  workspace_id   UUID NOT NULL,
  task_id_ref    VARCHAR(128),
  outcome        VARCHAR(32) NOT NULL DEFAULT 'ok'
                   CONSTRAINT chk_supply_call_outcome
                   CHECK (outcome IN ('ok', 'degraded', 'error')),
  error_code     VARCHAR(64),
  latency_ms     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_call_created
  ON karda_kb.supply_call (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_call_channel_created
  ON karda_kb.supply_call (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_call_consumer_created
  ON karda_kb.supply_call (consumer_code, created_at DESC);

CREATE TABLE IF NOT EXISTS karda_kb.supply_call_asset (
  call_id      UUID NOT NULL,
  kb_id        UUID NOT NULL,
  cited_count  INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_supply_call_asset PRIMARY KEY (call_id, kb_id),
  CONSTRAINT fk_supply_call_asset_call FOREIGN KEY (call_id)
    REFERENCES karda_kb.supply_call (id) ON DELETE CASCADE,
  CONSTRAINT fk_supply_call_asset_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_supply_call_asset_kb
  ON karda_kb.supply_call_asset (kb_id);

-- ------------------------------------------------------- grants + column locks --
-- 97's ON ALL TABLES grant and 98's column locks both ran before these tables
-- existed, so both travel here (the incr/0002 and incr/0003 pattern).

GRANT SELECT, INSERT, DELETE ON karda_kb.processing_task TO karda_svc;
GRANT SELECT, INSERT, DELETE ON karda_kb.processing_task_stage TO karda_svc;
-- Ledger tables: no DELETE. A served call is not something that stops having
-- happened; retention is a policy job, not a runtime capability (240 section 6,
-- riding KD-202's L0 governance placement). Matching REVOKEs live in 98 for the
-- fresh path, where 97's blanket grant DOES reach these tables.
GRANT SELECT, INSERT ON karda_kb.supply_call TO karda_svc;
GRANT SELECT, INSERT ON karda_kb.supply_call_asset TO karda_svc;

-- processing_task: state-machine advance + failure classification + timestamps.
-- document_id / kb_id / created_in_product / created_by / queued_at are the
-- task's identity and provenance - immutable. `tier` IS writable on purpose: a
-- controlled rebuild demotes a task from interactive to bulk so it stops
-- crowding the interactive queue (110-processing's queue discipline).
REVOKE UPDATE ON karda_kb.processing_task FROM karda_svc;
GRANT UPDATE (tier, state, current_stage, failure_class, failure_reason,
              attempt, started_at, finished_at, updated_at)
  ON karda_kb.processing_task TO karda_svc;

-- processing_task_stage: only the closing fields. stage and started_at are
-- history the moment they are written.
REVOKE UPDATE ON karda_kb.processing_task_stage FROM karda_svc;
GRANT UPDATE (outcome, ended_at, note)
  ON karda_kb.processing_task_stage TO karda_svc;

-- supply_call / supply_call_asset: append-only, not one writable column. The
-- GRANTs above never included UPDATE or DELETE; these REVOKEs are belt-and-
-- braces against a future ON ALL TABLES grant re-widening them.
REVOKE UPDATE, DELETE ON karda_kb.supply_call FROM karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.supply_call_asset FROM karda_svc;
