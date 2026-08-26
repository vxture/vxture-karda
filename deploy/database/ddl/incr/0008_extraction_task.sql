-- 0008_extraction_task.sql - extraction as its own pass (KD-211, batch 15).
--
-- The AUTHORITATIVE definition lives in 00_baseline.sql; this file mirrors it so
-- a LIVE database adopts the change via db-init without a destructive reset.
--
-- Change, all on karda_kb.processing_task:
--   kind                new column, 'processing' | 'extraction'
--   chk_..._stage       widened with 'extract'
--   chk_..._failure_class widened with 'unavailable'
--
-- WHY A KIND RATHER THAN A SIXTH STAGE (KD-211, owner 2026-08-26). The two
-- pipelines have different invalidation keys. The task key's config fingerprint
-- is (template, params, embedding model); extraction inside that same task means
-- changing the extraction model triggers a full re-embed of the corpus for a
-- change that touches no vector - and, worse, a re-embed would discard and
-- recompute assertions a HUMAN has already adjudicated. Per KD-210 those
-- adjudications are human work product; they must not be collateral damage of an
-- unrelated config change. Work with different invalidation keys is different
-- work.
--
-- WHY 'extract' IS A SINGLE STAGE AND NOT A SUB-PIPELINE. An extraction run is
-- all-windows-or-nothing (kb/assertions/extract-run.ts): storing partial results
-- would make a resumed run re-extract windows it cannot know already landed, and
-- the document would end up with every early assertion twice. With no resumable
-- midpoint there is nothing for sub-stages to record, so an extraction task's
-- stage is always 'extract'. The PROCESSING pipeline's five stages are unchanged
-- - 110-processing keeps its stage list exactly as it was.
--
-- WHY 'unavailable' JOINS THE FAILURE CLASSES. Both suspend, so this changes no
-- behaviour - it changes what an operator is TOLD. A capability that is not
-- granted yet and a quota that is exhausted need opposite actions: chase the
-- grant, versus wait. Today both land as 'quota' and the pipeline page says
-- 「挂起 · 配额」, which for an ungranted karda.extract is simply false - and it
-- would be false on 100% of the rows this increment creates. It also corrects
-- the same mislabel on embed, parked on the Atlas A1 grant the whole time.
--
-- No column-lock change: kind is written at INSERT and never updated (a task
-- does not change species), so it needs no UPDATE grant. state /
-- current_stage / failure_class are already granted.

ALTER TABLE karda_kb.processing_task
  ADD COLUMN IF NOT EXISTS kind VARCHAR(32) NOT NULL DEFAULT 'processing';

ALTER TABLE karda_kb.processing_task
  DROP CONSTRAINT IF EXISTS chk_processing_task_kind;
ALTER TABLE karda_kb.processing_task
  ADD CONSTRAINT chk_processing_task_kind
  CHECK (kind IN ('processing', 'extraction'));

-- DROP-then-ADD rather than a guarded ADD: these constraints already exist with
-- a narrower list, and an `IF NOT EXISTS`-style guard would silently keep the
-- old definition - the increment would report success and change nothing.
ALTER TABLE karda_kb.processing_task
  DROP CONSTRAINT IF EXISTS chk_processing_task_stage;
ALTER TABLE karda_kb.processing_task
  ADD CONSTRAINT chk_processing_task_stage
  CHECK (current_stage IN ('fetch', 'parse', 'chunk', 'embed', 'commit', 'extract'));

ALTER TABLE karda_kb.processing_task
  DROP CONSTRAINT IF EXISTS chk_processing_task_failure_class;
ALTER TABLE karda_kb.processing_task
  ADD CONSTRAINT chk_processing_task_failure_class
  CHECK (failure_class IN ('transient', 'permanent', 'quota', 'unavailable'));

-- The live-task uniqueness must become per (document, KIND). It exists for
-- CONCURRENCY - two pipelines on one document break 110-processing's atomic
-- chunk replace, which assumes a single writer. That reasoning is per-pipeline:
-- an extraction run writes assertions and never touches chunks, so it does not
-- contend with processing at all. Left keyed on document_id alone, this index
-- would have made an extraction task and a reprocess of the same document
-- mutually exclusive - a correctness rule about chunks silently serialising two
-- unrelated kinds of work.
DROP INDEX IF EXISTS karda_kb.uidx_processing_task_doc_live;
CREATE UNIQUE INDEX IF NOT EXISTS uidx_processing_task_doc_live
  ON karda_kb.processing_task (document_id, kind)
  WHERE state IN ('queued', 'running');

-- The extraction pass's work list is this query: documents with no settled
-- extraction task for their active chunk version. It is the ONLY index this
-- increment needs, because the pass has no in-memory queue to rebuild - the
-- database IS the work list, so a restart loses nothing.
CREATE INDEX IF NOT EXISTS idx_processing_task_kind_document
  ON karda_kb.processing_task (kind, document_id, state);
