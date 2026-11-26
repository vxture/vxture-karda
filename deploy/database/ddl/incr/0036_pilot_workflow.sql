BEGIN;
-- BEGIN PILOT WORKFLOW
CREATE TABLE IF NOT EXISTS karda_kb.pilot_case (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  created_by VARCHAR(128) NOT NULL,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title))>0),
  query VARCHAR(500) NOT NULL CHECK (length(btrim(query))>0),
  top_k INTEGER NOT NULL CHECK (top_k BETWEEN 1 AND 20),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  request_hash VARCHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (state IN ('open','reviewed','closed')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
  verdict VARCHAR(24) CHECK (verdict IN ('prefer_source','prefer_published','equivalent','neither')),
  reviewed_observation UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((state='open' AND verdict IS NULL AND reviewed_observation IS NULL) OR (state<>'open' AND verdict IS NOT NULL AND reviewed_observation IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.pilot_observation (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES karda_kb.pilot_case(id) ON DELETE CASCADE,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  summary JSONB NOT NULL CHECK (jsonb_typeof(summary)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id,id)
);
CREATE TABLE IF NOT EXISTS karda_kb.pilot_event (
  case_id UUID NOT NULL REFERENCES karda_kb.pilot_case(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('review','close','reopen')),
  observation_id UUID,
  verdict VARCHAR(24) CHECK (verdict IN ('prefer_source','prefer_published','equivalent','neither')),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(case_id,revision),
  UNIQUE(case_id,event_id),
  FOREIGN KEY(case_id,observation_id) REFERENCES karda_kb.pilot_observation(case_id,id),
  CHECK ((action='reopen' AND observation_id IS NULL AND verdict IS NULL) OR (action<>'reopen' AND observation_id IS NOT NULL AND verdict IS NOT NULL))
);
-- END PILOT WORKFLOW
-- BEGIN PILOT WORKFLOW LOCKS
REVOKE UPDATE, DELETE ON karda_kb.pilot_case, karda_kb.pilot_observation, karda_kb.pilot_event FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.pilot_case, karda_kb.pilot_observation, karda_kb.pilot_event TO karda_svc;
GRANT UPDATE (state,revision,verdict,reviewed_observation,updated_at) ON karda_kb.pilot_case TO karda_svc;
-- END PILOT WORKFLOW LOCKS
COMMIT;
