-- Column-level UPDATE whitelist (governance section 7). REVOKE table UPDATE, then
-- GRANT only the writable columns. Anchor columns (id, *_id reference keys,
-- created_at) are never writable. Append-only / link tables get no UPDATE at all.
-- Adding a writable column requires updating this whitelist, or the service write
-- fails with permission denied.

-- --- vx_provision ---
REVOKE UPDATE ON vx_provision.app_instance FROM karda_svc;
GRANT UPDATE (status, env, provisioned_at, updated_at)
  ON vx_provision.app_instance TO karda_svc;

-- webhook_delivery: append-only idempotency ledger -> no UPDATE.
REVOKE UPDATE ON vx_provision.webhook_delivery FROM karda_svc;

REVOKE UPDATE ON vx_provision.provision_seq FROM karda_svc;
GRANT UPDATE (last_seq, updated_at)
  ON vx_provision.provision_seq TO karda_svc;

-- --- local_authz ---
REVOKE UPDATE ON local_authz.member FROM karda_svc;
GRANT UPDATE (display_name, avatar_hash, status, updated_at)
  ON local_authz.member TO karda_svc;

-- role / permission catalogs are seeded via db-init, not mutated at runtime.
REVOKE UPDATE ON local_authz.role FROM karda_svc;
REVOKE UPDATE ON local_authz.permission FROM karda_svc;

-- link tables: insert/delete only.
REVOKE UPDATE ON local_authz.member_role FROM karda_svc;
REVOKE UPDATE ON local_authz.role_permission FROM karda_svc;

-- --- local_usage ---
-- raw: the flush job flips `flushed`; nothing else is mutable.
REVOKE UPDATE ON local_usage.raw FROM karda_svc;
GRANT UPDATE (flushed) ON local_usage.raw TO karda_svc;

REVOKE UPDATE ON local_usage.checkpoint FROM karda_svc;
GRANT UPDATE (flushed_at) ON local_usage.checkpoint TO karda_svc;

-- --- karda_kb (domain; authority = docs/30-design/210-data-model.md section 4) ---
-- Anchor columns are absent from every whitelist below: id, all *_id reference
-- keys, and created_at. Ownership and lineage (workspace_id, owner_type,
-- owner_sub, origin_kb_id, origin_snapshot_at) are equally immutable - once a
-- library's owner or provenance is established, changing it would rewrite
-- history rather than record it.

REVOKE UPDATE ON karda_kb.knowledge_base FROM karda_svc;
GRANT UPDATE (name, description, publish_state, processing_template_id,
              processing_params, embedding_model, fulltext_enabled, graph_enabled,
              retrieval_defaults, governance_enabled, default_verifier,
              default_verify_interval_days, exempt_synced_content, deleted_at,
              updated_at)
  ON karda_kb.knowledge_base TO karda_svc;

REVOKE UPDATE ON karda_kb.folder FROM karda_svc;
GRANT UPDATE (name, updated_at) ON karda_kb.folder TO karda_svc;

-- document: kb_id / source / source_ref / content_hash stay immutable - they are
-- the provenance and the dedup key; a mutable hash would make the idempotency
-- index lie.
REVOKE UPDATE ON karda_kb.document FROM karda_svc;
GRANT UPDATE (title, folder_id, processing_template_id, storage_ref,
              content_state, failure_reason, failed_at, verification_state,
              verifier, verified_at, expires_at, sensitivity, business_meta,
              active_chunk_version, updated_at)
  ON karda_kb.document TO karda_svc;
-- storage_ref IS writable: the pipeline fills it once the raw file lands in
-- karda's object storage, and a controlled rebuild may relocate it. source /
-- connector_code / source_ref / content_hash stay immutable - they are the
-- provenance and the dedup key.
-- active_chunk_version is writable: the atomic swap flips it at commit
-- (kb/processing/commit.ts), and without this grant NO document ever becomes
-- retrievable - the swap fails with `permission denied for table document` and
-- the pipeline can never publish a version.
--
-- It used to live only in incr/0001, because when that increment shipped the
-- column did not exist yet at the moment 98 ran on a live DB. That reasoning
-- expired the moment the baseline absorbed the increment: db-init runs
-- baseline -> 97 -> 98, so on a FRESH database the column is there before this
-- file. Leaving the grant only in the increment meant every newly-initialised
-- environment - beta, and the first production install - got a pipeline that
-- could not commit, while every migrated database was fine. Restored 2026-08-26,
-- found by a get_context probe; incr/0001 keeps its copy for old databases.
-- General rule for any writable column added by an increment: see incr/README.md.

REVOKE UPDATE ON karda_kb.entry FROM karda_svc;
GRANT UPDATE (title, folder_id, content_template_id, template_version, fields,
              content_state, failure_reason, failed_at, verification_state,
              verifier, verified_at, expires_at, sensitivity, business_meta,
              updated_at)
  ON karda_kb.entry TO karda_svc;

-- chunk: derived data, rebuilt rather than edited. Granting nothing here forces
-- content changes through the processing pipeline's atomic replace, so index and
-- source cannot silently diverge via a stray UPDATE.
REVOKE UPDATE ON karda_kb.chunk FROM karda_svc;

-- Template and field declarations are seeded / changed through the admin path,
-- and evolution means a new version row - never an in-place edit.
REVOKE UPDATE ON karda_kb.processing_template FROM karda_svc;
REVOKE UPDATE ON karda_kb.content_template FROM karda_svc;
REVOKE UPDATE ON karda_kb.content_template_field FROM karda_svc;
REVOKE UPDATE ON karda_kb.kb_metadata_field FROM karda_svc;

-- binding: kb_id / connector_code / external_source_id / created_by are the
-- subscription's identity and its OBO provenance - changing any of them would
-- silently repoint an existing sync at a different source or owner rather than
-- creating a new subscription.
REVOKE UPDATE ON karda_kb.binding FROM karda_svc;
GRANT UPDATE (mode, state, cursor, last_synced_at, updated_at)
  ON karda_kb.binding TO karda_svc;

-- kb_attachment: a working-set link, insert/delete only - attaching and
-- detaching are the only operations, so there is no UPDATE to grant. The table is
-- added by incr/0002, which db-init applies AFTER this file, so its SELECT/INSERT/
-- DELETE grant travels with that increment (incr/README.md); there is nothing to
-- REVOKE here because 97's `ON ALL TABLES` grant also predates the table.

-- --- karda_kb ops read models (240-ops-read-models) ---
-- These four tables are in 00_baseline.sql (fresh DBs get them here) AND in
-- incr/0004 (live DBs adopt them there). db-init applies baseline -> 97 -> 98 ->
-- incr/*, so at THIS point they exist on a fresh DB and do NOT exist on a live
-- one - hence the existence guard. Without it the statements below fail on a
-- live database; without the statements at all, a FRESH database ends up with
-- 97's blanket SELECT/INSERT/DELETE and no column lock, i.e. the two ledgers
-- would be deletable and the two task tables would have no UPDATE grant at all
-- (their state machine could not advance). Both halves are needed.
-- incr/0004 repeats them unguarded for the live path; both are idempotent.
DO $$
BEGIN
  IF to_regclass('karda_kb.processing_task') IS NOT NULL THEN
    -- document_id / kb_id / created_in_product / created_by / queued_at are the
    -- task's identity and provenance - immutable. `tier` IS writable on purpose:
    -- a controlled rebuild demotes a task from interactive to bulk so it stops
    -- crowding the interactive queue (110-processing's queue discipline).
    REVOKE UPDATE ON karda_kb.processing_task FROM karda_svc;
    GRANT UPDATE (tier, state, current_stage, failure_class, failure_reason,
                  attempt, started_at, finished_at, updated_at)
      ON karda_kb.processing_task TO karda_svc;

    -- Only the closing fields: stage and started_at are history once written.
    REVOKE UPDATE ON karda_kb.processing_task_stage FROM karda_svc;
    GRANT UPDATE (outcome, ended_at, note)
      ON karda_kb.processing_task_stage TO karda_svc;

    -- Append-only ledgers. DELETE is revoked too, because 97 hands out
    -- SELECT/INSERT/DELETE to every table in the schema and a served call is not
    -- something that stops having happened. Retention is a policy job, not a
    -- runtime capability (240 section 6).
    REVOKE UPDATE, DELETE ON karda_kb.supply_call FROM karda_svc;
    REVOKE UPDATE, DELETE ON karda_kb.supply_call_asset FROM karda_svc;
  END IF;
END $$;

-- --- karda_kb evaluation runner (240 section 8, built in batch 14) ------------
-- Same two-place pattern as the ops read models above, and for the same reason:
-- these four are in 00_baseline.sql (fresh DBs get them here) AND in incr/0005
-- (live DBs adopt them there). db-init applies baseline -> 97 -> 98 -> incr/*,
-- so at THIS point they exist on a fresh DB and do NOT exist on a live one -
-- hence the guard. Without it these statements fail on a live database; without
-- them at all, a FRESH database keeps 97's blanket SELECT/INSERT/DELETE and no
-- column lock, so a run's baseline label would be editable after the fact and a
-- result could be rewritten - neither is evidence any more.
-- incr/0005 repeats them unguarded for the live path; both are idempotent.
DO $$
BEGIN
  IF to_regclass('karda_kb.eval_set') IS NOT NULL THEN
    -- workspace_id / created_by are identity and authorship. Repointing an
    -- existing set at another workspace is not an edit, it is a leak.
    REVOKE UPDATE ON karda_kb.eval_set FROM karda_svc;
    GRANT UPDATE (name, description, kb_scope, updated_at)
      ON karda_kb.eval_set TO karda_svc;

    -- set_id is immutable: moving a question between sets would silently change
    -- what every past run of BOTH sets measured.
    REVOKE UPDATE ON karda_kb.eval_question FROM karda_svc;
    GRANT UPDATE (question, expected_evidence, note, position, updated_at)
      ON karda_kb.eval_question TO karda_svc;

    -- Everything that DEFINES the comparison is immutable - which set, which
    -- baseline, which quality tier, which top_k, when it started. Only the
    -- closing fields are writable: a run opens `running` and is completed once.
    -- A run whose baseline label could be edited afterwards is not evidence.
    REVOKE UPDATE ON karda_kb.eval_run FROM karda_svc;
    GRANT UPDATE (state, question_count, recall_hit_pct, citation_precision_pct,
                  grounded_answer_pct, gap_count, degraded, error_code, finished_at)
      ON karda_kb.eval_run TO karda_svc;

    -- A measurement, written once. DELETE stays (97 grants it) so a bad RUN can
    -- be removed and cascade - unlike supply_call, an eval run is an experiment
    -- artifact, not a record that a service call happened.
    REVOKE UPDATE ON karda_kb.eval_run_result FROM karda_svc;
  END IF;
END $$;

-- --- assertion layer (incr/0006) ---------------------------------------------
--
-- Guarded on existence: a database that has not yet taken incr/0006 must not
-- fail this file. The increment carries the same locks unguarded, because the
-- tables are created in the same transaction there.
DO $$
BEGIN
  IF to_regclass('karda_kb.assertion') IS NOT NULL THEN
    -- assertion: kb_id is the assertion's home and its authorization anchor -
    -- repointing one at another library is not an edit, it is a leak (the same
    -- reasoning that locks eval_set.workspace_id).
    --
    -- The extraction record is immutable: `extracted_by`, `extraction_run` and
    -- `confidence` say what the machine did and how sure it was. Editing them
    -- afterwards would erase the only basis for judging the extractor.
    --
    -- `kind`, `subject`, `statement`, `asserted_by` and the validity window ARE
    -- writable: a mis-extracted kind or a wrong `asserted_by` is precisely the sort
    -- of error verification exists to catch, and catching it has to mean fixing it.
    REVOKE UPDATE ON karda_kb.assertion FROM karda_svc;
    GRANT UPDATE (kind, subject, statement, asserted_by, as_of, valid_until,
                  content_state, failure_reason, failed_at,
                  verification_state, verifier, verified_at, expires_at,
                  superseded_by, updated_at)
      ON karda_kb.assertion TO karda_svc;

    -- span: a measurement of one version of one document, written once. UPDATE is
    -- revoked entirely - a span whose offsets or excerpt could be rewritten cannot
    -- anchor a citation. A rebuild does not edit spans; it produces new ones at a
    -- new document_version.
    REVOKE UPDATE ON karda_kb.span FROM karda_svc;

    -- evidence: an edge, written once. If the stance was wrong the edge was wrong -
    -- delete it and add the right one (97 grants DELETE). Allowing a flip from
    -- `supports` to `contradicts` in place would rewrite the history of an
    -- adjudication that already happened.
    REVOKE UPDATE ON karda_kb.evidence FROM karda_svc;

    -- entity: kb_id is immutable for the same reason as assertion.kb_id. Name, kind
    -- and aliases are editable - an entity registry that cannot absorb "it is also
    -- called X" is not a registry.
    REVOKE UPDATE ON karda_kb.entity FROM karda_svc;
    GRANT UPDATE (name, kind, aliases, updated_at)
      ON karda_kb.entity TO karda_svc;

    -- assertion_mention: the whole row IS the key. Changing any part of it means a
    -- different mention, so it is delete-and-insert, never update.
    REVOKE UPDATE ON karda_kb.assertion_mention FROM karda_svc;
  END IF;
END $$;
