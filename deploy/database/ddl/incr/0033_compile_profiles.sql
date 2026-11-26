BEGIN;
-- BEGIN COMPILE PROFILES
CREATE TABLE IF NOT EXISTS karda_kb.compile_profile_version (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title))>0),
  schema_id VARCHAR(64) NOT NULL,
  schema_version VARCHAR(64) NOT NULL,
  definition_hash VARCHAR(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition)='object'),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,id),
  UNIQUE(kb_id,schema_id,schema_version)
);
CREATE TABLE IF NOT EXISTS karda_kb.compile_profile_activation (
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  profile_id UUID,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 10000),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,revision),
  UNIQUE(kb_id,event_id),
  FOREIGN KEY(kb_id,profile_id) REFERENCES karda_kb.compile_profile_version(kb_id,id)
);
-- END COMPILE PROFILES
-- BEGIN COMPILE PROFILE LOCKS
REVOKE UPDATE, DELETE ON karda_kb.compile_profile_version, karda_kb.compile_profile_activation FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.compile_profile_version, karda_kb.compile_profile_activation TO karda_svc;
-- END COMPILE PROFILE LOCKS
COMMIT;
