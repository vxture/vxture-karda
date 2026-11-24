BEGIN;

-- Semantic foundation: additive only; db-init is the sole application path.
-- BEGIN SEMANTIC FOUNDATION
CREATE UNIQUE INDEX IF NOT EXISTS uidx_entity_semantic_scope ON karda_kb.entity(kb_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_assertion_semantic_scope ON karda_kb.assertion(kb_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_document_semantic_scope ON karda_kb.document(kb_id,id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_schema_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
  namespace VARCHAR(128) NOT NULL,
  schema_id VARCHAR(128) NOT NULL,
  version VARCHAR(128) NOT NULL,
  definition_hash VARCHAR(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,namespace,schema_id,version), UNIQUE(kb_id,id)
);

-- Append-only decisions outlive compilation/rebuild. No inferred human identity.
CREATE TABLE IF NOT EXISTS karda_kb.semantic_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
  subject_key VARCHAR(256) NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  decision VARCHAR(16) NOT NULL CHECK (decision IN ('accept','revise','reject')),
  subject_hash VARCHAR(64) NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  reviewer_sub VARCHAR(128) NOT NULL CHECK (length(btrim(reviewer_sub))>0),
  note TEXT NOT NULL CHECK (length(btrim(note))>0 AND length(note)<=10000),
  correction JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(correction)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,subject_key,revision), UNIQUE(kb_id,id)
);

-- Completed compilation snapshots; in-flight scheduling belongs to task runs.
CREATE TABLE IF NOT EXISTS karda_kb.semantic_compile_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL,
  schema_version_id UUID NOT NULL,
  task_key VARCHAR(64) NOT NULL CHECK (task_key ~ '^[a-f0-9]{64}$'),
  input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  config_hash VARCHAR(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  source_manifest JSONB NOT NULL CHECK (jsonb_typeof(source_manifest)='array'),
  candidates JSONB NOT NULL CHECK (jsonb_typeof(candidates)='object'),
  status VARCHAR(16) NOT NULL CHECK (status IN ('validated','rejected','failed')),
  error_code VARCHAR(128),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,task_key), UNIQUE(kb_id,id,schema_version_id),
  FOREIGN KEY(kb_id,schema_version_id) REFERENCES karda_kb.semantic_schema_version(kb_id,id)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL,
  generation INTEGER NOT NULL CHECK (generation>0),
  schema_version_id UUID NOT NULL,
  compile_run_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,generation), UNIQUE(kb_id,id), UNIQUE(kb_id,id,generation),
  FOREIGN KEY(kb_id,compile_run_id,schema_version_id)
    REFERENCES karda_kb.semantic_compile_run(kb_id,id,schema_version_id)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release_head (
  kb_id UUID PRIMARY KEY REFERENCES karda_kb.knowledge_base(id),
  generation INTEGER NOT NULL CHECK (generation>0),
  release_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(kb_id,release_id,generation) REFERENCES karda_kb.semantic_release(kb_id,id,generation)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_relation (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  relation_id UUID NOT NULL,
  type VARCHAR(128) NOT NULL,
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  origin VARCHAR(16) NOT NULL DEFAULT 'asserted' CHECK (origin='asserted'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,relation_id),
  FOREIGN KEY(kb_id,release_id) REFERENCES karda_kb.semantic_release(kb_id,id),
  FOREIGN KEY(kb_id,source_id) REFERENCES karda_kb.entity(kb_id,id),
  FOREIGN KEY(kb_id,target_id) REFERENCES karda_kb.entity(kb_id,id)
);
CREATE INDEX IF NOT EXISTS idx_semantic_relation_source ON karda_kb.semantic_relation(kb_id,release_id,source_id);
CREATE INDEX IF NOT EXISTS idx_semantic_relation_target ON karda_kb.semantic_relation(kb_id,release_id,target_id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_relation_assertion (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  relation_id UUID NOT NULL,
  assertion_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,relation_id,assertion_id),
  FOREIGN KEY(kb_id,release_id,relation_id) REFERENCES karda_kb.semantic_relation(kb_id,release_id,relation_id),
  FOREIGN KEY(kb_id,assertion_id) REFERENCES karda_kb.assertion(kb_id,id)
);
CREATE INDEX IF NOT EXISTS idx_semantic_assertion_impact ON karda_kb.semantic_relation_assertion(kb_id,assertion_id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release_source (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  document_id UUID NOT NULL,
  document_version INTEGER NOT NULL CHECK (document_version>0),
  content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,document_id),
  FOREIGN KEY(kb_id,release_id) REFERENCES karda_kb.semantic_release(kb_id,id),
  FOREIGN KEY(kb_id,document_id) REFERENCES karda_kb.document(kb_id,id)
);
CREATE INDEX IF NOT EXISTS idx_semantic_source_impact ON karda_kb.semantic_release_source(kb_id,document_id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release_review (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  review_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,review_id),
  FOREIGN KEY(kb_id,release_id) REFERENCES karda_kb.semantic_release(kb_id,id),
  FOREIGN KEY(kb_id,review_id) REFERENCES karda_kb.semantic_review(kb_id,id)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_event_receipt (
  kb_id UUID NOT NULL,
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  release_id UUID NOT NULL,
  generation INTEGER NOT NULL CHECK (generation>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,event_id),
  FOREIGN KEY(kb_id,release_id,generation) REFERENCES karda_kb.semantic_release(kb_id,id,generation)
);
-- END SEMANTIC FOUNDATION

-- BEGIN SEMANTIC LOCKS
GRANT SELECT, INSERT ON karda_kb.semantic_schema_version, karda_kb.semantic_review,
  karda_kb.semantic_compile_run, karda_kb.semantic_release, karda_kb.semantic_release_head,
  karda_kb.semantic_relation, karda_kb.semantic_relation_assertion,
  karda_kb.semantic_release_source, karda_kb.semantic_release_review, karda_kb.semantic_event_receipt TO karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.semantic_schema_version, karda_kb.semantic_review,
  karda_kb.semantic_compile_run, karda_kb.semantic_release, karda_kb.semantic_release_head,
  karda_kb.semantic_relation, karda_kb.semantic_relation_assertion,
  karda_kb.semantic_release_source, karda_kb.semantic_release_review, karda_kb.semantic_event_receipt FROM karda_svc;
GRANT UPDATE (generation, release_id, updated_at) ON karda_kb.semantic_release_head TO karda_svc;
-- END SEMANTIC LOCKS
COMMIT;
