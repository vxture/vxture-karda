BEGIN;
-- BEGIN KNOWLEDGE ROLLOUT
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_rollout_event (
  workspace_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  event_id UUID NOT NULL,
  enabled BOOLEAN NOT NULL,
  reason VARCHAR(1000) NOT NULL CHECK (length(btrim(reason)) > 0),
  changed_by VARCHAR(128) NOT NULL CHECK (length(btrim(changed_by)) > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(workspace_id, revision),
  UNIQUE(workspace_id, event_id)
);
-- END KNOWLEDGE ROLLOUT
-- BEGIN KNOWLEDGE ROLLOUT LOCKS
GRANT SELECT, INSERT ON karda_kb.knowledge_rollout_event TO karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.knowledge_rollout_event FROM karda_svc;
-- END KNOWLEDGE ROLLOUT LOCKS
COMMIT;
