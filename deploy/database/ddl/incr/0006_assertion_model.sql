-- 0006_assertion_model.sql - the assertion layer (140-assertion-model, batch 15).
--
-- The AUTHORITATIVE definition (a fresh apply + the data-architecture guardrail)
-- lives in 00_baseline.sql; this file mirrors it so a LIVE database adopts the
-- tables via db-init without a destructive reset.
--
-- Change: five brand-new tables in karda_kb -
--   assertion          one statement with its provenance (fact/claim/event/...)
--   span               a byte range in one VERSION of a document
--   evidence           the edge from an assertion to its grounds
--   entity             the library's registry of business objects
--   assertion_mention  the edge from an assertion to an entity it names
--
-- Why they exist: v1's object model is a CARRIER model - it answers where a
-- piece of content lives, how it is split and how it is recalled, but not what
-- it SAYS. KD-017 raised the positioning to shared knowledge infrastructure for
-- agents and ruled that "Chunk is an intermediate product, not the core model".
-- The product's own pipeline canvas already assumes this layer (its five stages
-- are 理解 → 萃取 → 编织 → 验证 → 入藏, and the steward proposes 冲突裁决), and
-- conflict adjudication has no implementable definition without an assertion
-- object: a conflict is not a text-similarity problem, it is two versions of the
-- same assertion.
--
-- Both the service-role grants AND the column-lock whitelist travel with this
-- increment, because db-init applies baseline -> 97 -> 98 -> incr/*, so neither
-- 97's ON ALL TABLES grant nor 98's column locks can see a table added here
-- (incr/README.md).
--
-- Idempotent: safe to re-run.

-- --- assertion ----------------------------------------------------------------
--
-- The five kinds from the blueprint (fact / claim / event / procedure / rule)
-- are an ENUM on one table, not five tables: their field needs are identical
-- (subject, statement, validity window, source, confidence) and the difference
-- is semantic. Five tables would mean five copies of the provenance and
-- governance logic on day one.
--
-- THE ONE COLUMN PAIR TO READ CAREFULLY: `asserted_by` and `extracted_by` are
-- not the same thing and must never be merged.
--   asserted_by   WHO SAID IT - the authority inside the source (the body that
--                 issued 《作业手册 2026》). This is what a citing agent needs.
--   extracted_by  WHO PULLED IT OUT - the model or steward run. This is process
--                 accountability.
-- Collapsing them makes the product tell an agent "karda said this", which
-- silently substitutes our authority for the source's.
--
-- There is deliberately NO `source_verified` column. KD-209 ruled the source
-- document's verification state is a SIGNAL that may be consulted, not a STATE
-- that is inherited - and a copied signal is a snapshot that goes stale. Read it
-- through evidence -> span -> document at query time, where it is always true.
CREATE TABLE IF NOT EXISTS karda_kb.assertion (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id              UUID NOT NULL,
  kind               VARCHAR(32) NOT NULL
                       CONSTRAINT chk_assertion_kind
                       CHECK (kind IN ('fact', 'claim', 'event', 'procedure', 'rule')),
  -- What the assertion is ABOUT. Used to cluster conflict candidates: two
  -- assertions can only contradict if they are about the same subject.
  subject            VARCHAR(512),
  statement          TEXT NOT NULL,
  asserted_by        VARCHAR(512),
  as_of              TIMESTAMPTZ,
  -- NULL = the source declared no expiry, NOT "never expires". The distinction
  -- matters for governance: an undeclared window is unknown, not infinite.
  valid_until        TIMESTAMPTZ,
  extracted_by       VARCHAR(128),
  extraction_run     UUID,
  -- Machine confidence at extraction. NULL for an authored assertion, which has
  -- no such thing. KD-210: it ranks an assertion only until a person confirms
  -- it; after that `verification_state` is the stronger signal and confidence
  -- stops scoring - but is never cleared, because it is the record of how the
  -- extractor performed.
  confidence         NUMERIC(4,3)
                       CONSTRAINT chk_assertion_confidence
                       CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_state      VARCHAR(32) NOT NULL DEFAULT 'draft'
                       CONSTRAINT chk_assertion_content_state
                       CHECK (content_state IN ('draft', 'processing', 'indexed', 'failed', 'archived', 'deleted')),
  failure_reason     TEXT,
  failed_at          TIMESTAMPTZ,
  verification_state VARCHAR(32) NOT NULL DEFAULT 'unverified'
                       CONSTRAINT chk_assertion_verification_state
                       CHECK (verification_state IN ('unverified', 'verified', 'stale')),
  verifier           VARCHAR(128),
  verified_at        TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  -- Set when a conflict is adjudicated: this assertion lost, and the winner is
  -- named. The loser is KEPT - "which one did we believe, and what did we
  -- replace" is exactly the question a superseded row exists to answer.
  superseded_by      UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_assertion_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  -- The ops read model may be pruned; losing the task must not lose the
  -- assertion, so this detaches rather than cascades.
  CONSTRAINT fk_assertion_extraction_run FOREIGN KEY (extraction_run)
    REFERENCES karda_kb.processing_task (id) ON DELETE SET NULL,
  CONSTRAINT fk_assertion_superseded_by FOREIGN KEY (superseded_by)
    REFERENCES karda_kb.assertion (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_assertion_kb_content
  ON karda_kb.assertion (kb_id, content_state);
-- The steward queue reads this one: everything awaiting a person, per library.
CREATE INDEX IF NOT EXISTS idx_assertion_kb_verification
  ON karda_kb.assertion (kb_id, verification_state);
-- Conflict candidates are found by subject, not by embedding distance.
CREATE INDEX IF NOT EXISTS idx_assertion_kb_subject
  ON karda_kb.assertion (kb_id, subject);

-- --- span ---------------------------------------------------------------------
--
-- A byte range in ONE VERSION of a document. `document_version` is the third of
-- yucer's three questions ("哪一版") and is why this is not just a chunk
-- reference: a chunk is reborn on every rebuild, a span is anchored to the
-- version it was read from.
--
-- `excerpt` is stored redundantly on purpose. After a rebuild the offsets may
-- no longer resolve against the current text, and a citation that cannot show
-- what it quoted is not a citation.
--
-- A span is a MEASUREMENT and is never updated (see the column locks below).
CREATE TABLE IF NOT EXISTS karda_kb.span (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL,
  document_version INTEGER NOT NULL,
  start_offset     INTEGER NOT NULL,
  end_offset       INTEGER NOT NULL,
  excerpt          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_span_range CHECK (end_offset > start_offset AND start_offset >= 0),
  CONSTRAINT fk_span_document FOREIGN KEY (document_id)
    REFERENCES karda_kb.document (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_span_document_version
  ON karda_kb.span (document_id, document_version);

-- --- evidence -----------------------------------------------------------------
--
-- An EDGE, not a column on `assertion`. One assertion can rest on several
-- grounds, one span can support several assertions, and grounds can themselves
-- be assertions (a derivation chain). A column would break the first time two
-- documents both supported the same statement.
--
-- `stance = 'contradicts'` is where conflict detection lands: two assertions
-- that each have supporting evidence AND contradict each other are the input to
-- a steward proposal.
CREATE TABLE IF NOT EXISTS karda_kb.evidence (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assertion_id UUID NOT NULL,
  span_id      UUID,
  supports_id  UUID,
  stance       VARCHAR(16) NOT NULL DEFAULT 'supports'
                 CONSTRAINT chk_evidence_stance
                 CHECK (stance IN ('supports', 'contradicts')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one ground. An edge with neither end is not evidence; an edge with
  -- both is two claims wearing one row.
  CONSTRAINT chk_evidence_one_ground
    CHECK ((span_id IS NOT NULL) <> (supports_id IS NOT NULL)),
  CONSTRAINT fk_evidence_assertion FOREIGN KEY (assertion_id)
    REFERENCES karda_kb.assertion (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_span FOREIGN KEY (span_id)
    REFERENCES karda_kb.span (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_supports FOREIGN KEY (supports_id)
    REFERENCES karda_kb.assertion (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_evidence_assertion
  ON karda_kb.evidence (assertion_id);
CREATE INDEX IF NOT EXISTS idx_evidence_span
  ON karda_kb.evidence (span_id);

-- --- entity -------------------------------------------------------------------
--
-- The library's registry of business objects. Scoped to ONE library on purpose:
-- cross-library entity resolution is an ontology problem and belongs to the
-- Ontos plane (Atlas thinks, Runos acts, Karda knows, Arda holds data, Ontos
-- holds semantics). Writing that boundary down now is what stops this table
-- growing into a half-built ontology.
CREATE TABLE IF NOT EXISTS karda_kb.entity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id      UUID NOT NULL,
  name       VARCHAR(512) NOT NULL,
  kind       VARCHAR(64) NOT NULL DEFAULT 'thing',
  aliases    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_entity_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE
);
-- One entity per (library, kind, name). Two things that share a name but not a
-- kind are two things.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_entity_kb_kind_name
  ON karda_kb.entity (kb_id, kind, name);

-- --- assertion_mention --------------------------------------------------------
--
-- Which entities an assertion names, and in what role. A composite key rather
-- than a surrogate id: the same assertion naming the same entity in the same
-- role twice is a duplicate, and the key says so.
CREATE TABLE IF NOT EXISTS karda_kb.assertion_mention (
  assertion_id UUID NOT NULL,
  entity_id    UUID NOT NULL,
  role         VARCHAR(32) NOT NULL DEFAULT 'mentions',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assertion_id, entity_id, role),
  CONSTRAINT fk_mention_assertion FOREIGN KEY (assertion_id)
    REFERENCES karda_kb.assertion (id) ON DELETE CASCADE,
  CONSTRAINT fk_mention_entity FOREIGN KEY (entity_id)
    REFERENCES karda_kb.entity (id) ON DELETE CASCADE
);
-- `find_entity` walks this direction: entity -> the assertions that name it.
CREATE INDEX IF NOT EXISTS idx_mention_entity
  ON karda_kb.assertion_mention (entity_id);

-- --- service-role grants (97's ON ALL TABLES ran before these tables existed) ---
GRANT SELECT, INSERT, DELETE ON
  karda_kb.assertion,
  karda_kb.span,
  karda_kb.evidence,
  karda_kb.entity,
  karda_kb.assertion_mention
  TO karda_svc;

-- --- column locks (98 ran before these tables existed; unguarded here) --------
--
-- Repeated from 98_column_locks.sql, which guards them on existence for the
-- fresh path. Here they are unconditional: on the live path the tables were just
-- created above.

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
