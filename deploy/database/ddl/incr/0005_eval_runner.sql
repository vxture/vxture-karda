-- 0005_eval_runner.sql - the evaluation runner's four tables (240 section 8).
--
-- The AUTHORITATIVE definition (a fresh apply + the data-architecture guardrail)
-- lives in 00_baseline.sql; this file mirrors it so a LIVE database adopts the
-- tables via db-init without a destructive reset.
--
-- Change: four brand-new tables in karda_kb -
--   eval_set         an authored question set (KD-011: no synthetic QA in v1)
--   eval_question    one question + the evidence a correct answer must rest on
--   eval_run         one run of one set against one named baseline
--   eval_run_result  per-question outcome; the three page metrics aggregate it
--
-- Why they exist: retrieval quality is the product's stated foundation and
-- NOTHING could answer whether a change made it better or worse - recall hit
-- rate, citation precision and grounded-answer rate were all demo figures.
-- Section 8 deferred these deliberately ("建四张表去等一个不存在的运行器,是投机性
-- schema"); the runner lands in this same batch, so the deferral is over.
--
-- Both the service-role grants AND the column-lock whitelist travel with this
-- increment, because db-init applies baseline -> 97 -> 98 -> incr/*, so neither
-- 97's ON ALL TABLES grant nor 98's column locks can see a table added here
-- (incr/README.md).
--
-- Idempotent: safe to re-run.

-- --- evaluation runner (240-ops-read-models section 8, built in batch 14) -----
--
-- Section 8 designed these four and deliberately did NOT build them: "四张空表
-- 进了基线" for a runner that did not exist is speculative schema. The runner
-- exists now, so the shape from that section lands verbatim.
--
-- Why quality needs its own tables at all: recall hit rate, citation precision
-- and grounded-answer rate were demo figures, so nothing could answer whether a
-- chunking change, a model swap or a template edit made retrieval better or
-- worse. A number nobody can reproduce is not a baseline.

-- An authored question set. KD-011 ruled out synthetic QA generation for v1, so
-- every question here is written by a person.
CREATE TABLE IF NOT EXISTS karda_kb.eval_set (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                     -- [ref] owning workspace
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  -- The libraries a run evaluates over, as a JSONB array of kb ids. NOT a join
  -- table: the scope is a property of the set, not an entity, and section 8
  -- specifies four tables. A kb id that no longer exists simply drops out of the
  -- scope at run time - the set stays valid and says so in its result.
  kb_scope      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by    VARCHAR(128),                      -- [ref] the author
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_eval_set_ws_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_eval_set_ws
  ON karda_kb.eval_set (workspace_id, created_at DESC);

-- One question, with the evidence a correct answer must rest on.
CREATE TABLE IF NOT EXISTS karda_kb.eval_question (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id        UUID NOT NULL,
  question      TEXT NOT NULL,
  -- Expected evidence as DOCUMENT / ENTRY ids, never chunk ids. A chunk id is
  -- reborn on every rebuild (110-processing's atomic replace bumps the version
  -- and mints new ids), so a set pinned to chunks would break on exactly the
  -- change it exists to measure. Recall returns chunk ids; the runner maps them
  -- back to their document before comparing.
  expected_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  note          TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_eval_question_set FOREIGN KEY (set_id)
    REFERENCES karda_kb.eval_set (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eval_question_set
  ON karda_kb.eval_question (set_id, position);

-- One run of one set against one baseline. The BASELINE LABEL is what makes a
-- run comparable: "did this change help" is only answerable between two runs
-- that name what they ran against.
CREATE TABLE IF NOT EXISTS karda_kb.eval_run (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id              UUID NOT NULL,
  workspace_id        UUID NOT NULL,               -- [ref] denormalised for scoping
  baseline_label      VARCHAR(128) NOT NULL,       -- e.g. bge-m3@v2 / rerank-off
  verification_filter VARCHAR(32) NOT NULL,        -- the quality tier the run asked for
  top_k               INTEGER NOT NULL,
  state               VARCHAR(32) NOT NULL DEFAULT 'running'
                        CONSTRAINT chk_eval_run_state
                        CHECK (state IN ('running', 'completed', 'failed')),
  -- Aggregates, written once at completion. Stored rather than recomputed so a
  -- run stays a durable, comparable record even after its set is edited - a
  -- before/after that silently re-derives from today's questions is not a
  -- before/after.
  question_count      INTEGER NOT NULL DEFAULT 0,
  recall_hit_pct      NUMERIC(5,2),
  citation_precision_pct NUMERIC(5,2),
  grounded_answer_pct NUMERIC(5,2),
  gap_count           INTEGER NOT NULL DEFAULT 0,
  -- Honest disclosure, carried per run: a run whose rerank was unavailable
  -- measured a different chain than one whose was, and comparing them as equals
  -- is how a phantom regression gets reported.
  degraded            BOOLEAN NOT NULL DEFAULT false,
  error_code          VARCHAR(64),
  created_by          VARCHAR(128),                -- [ref] who ran it
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  CONSTRAINT fk_eval_run_set FOREIGN KEY (set_id)
    REFERENCES karda_kb.eval_set (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eval_run_set_started
  ON karda_kb.eval_run (set_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_run_ws_started
  ON karda_kb.eval_run (workspace_id, started_at DESC);

-- Per-question outcome. This is where a GAP is a first-class fact rather than a
-- subtraction: a question whose expected evidence never surfaced is the one row
-- an operator has to look at, and it names which question.
CREATE TABLE IF NOT EXISTS karda_kb.eval_run_result (
  run_id         UUID NOT NULL,
  question_id    UUID NOT NULL,
  -- Did any expected document appear in the recalled set? The recall half.
  recall_hit     BOOLEAN NOT NULL,
  -- Of the citations the answer actually used, how many were expected. The
  -- precision half; both counts are kept so the ratio can be re-derived and
  -- audited rather than trusted.
  cited_expected INTEGER NOT NULL DEFAULT 0,
  cited_total    INTEGER NOT NULL DEFAULT 0,
  -- Did the run produce an answer resting on at least one citation? An
  -- ungrounded answer is a failure even when it reads well - that is the whole
  -- premise of a cited-answer product.
  grounded       BOOLEAN NOT NULL DEFAULT false,
  answer_excerpt TEXT,
  latency_ms     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_eval_run_result PRIMARY KEY (run_id, question_id),
  CONSTRAINT fk_eval_run_result_run FOREIGN KEY (run_id)
    REFERENCES karda_kb.eval_run (id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_run_result_question FOREIGN KEY (question_id)
    REFERENCES karda_kb.eval_question (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eval_run_result_run
  ON karda_kb.eval_run_result (run_id);

-- --- service-role grants (97's ON ALL TABLES ran before these tables existed) ---
GRANT SELECT, INSERT, DELETE ON
  karda_kb.eval_set,
  karda_kb.eval_question,
  karda_kb.eval_run,
  karda_kb.eval_run_result
  TO karda_svc;

-- --- column locks (98 ran before these tables existed; unguarded here) --------
--
-- Repeated from 98_column_locks.sql, which guards them on existence for the
-- fresh path. Here they are unconditional: on the live path the tables were just
-- created above.

-- eval_set: workspace_id and created_by are the set's identity and authorship -
-- repointing an existing set at another workspace is not an edit, it is a leak.
REVOKE UPDATE ON karda_kb.eval_set FROM karda_svc;
GRANT UPDATE (name, description, kb_scope, updated_at)
  ON karda_kb.eval_set TO karda_svc;

-- eval_question: set_id is immutable - moving a question between sets would
-- silently change what every past run of both sets measured.
REVOKE UPDATE ON karda_kb.eval_question FROM karda_svc;
GRANT UPDATE (question, expected_evidence, note, position, updated_at)
  ON karda_kb.eval_question TO karda_svc;

-- eval_run: everything that DEFINES the comparison is immutable - which set,
-- which baseline, which quality tier, which top_k, when it started. Only the
-- closing fields are writable, because a run opens as `running` and is completed
-- once. A run whose baseline label could be edited afterwards is not evidence.
REVOKE UPDATE ON karda_kb.eval_run FROM karda_svc;
GRANT UPDATE (state, question_count, recall_hit_pct, citation_precision_pct,
              grounded_answer_pct, gap_count, degraded, error_code, finished_at)
  ON karda_kb.eval_run TO karda_svc;

-- eval_run_result: a measurement, written once. UPDATE is revoked because a
-- result that can be rewritten cannot be cited as a before/after. DELETE stays
-- (97 grants it) so a bad RUN can be removed and cascade - unlike supply_call,
-- an eval run is an experiment artifact, not a record that a service call
-- happened.
REVOKE UPDATE ON karda_kb.eval_run_result FROM karda_svc;
