BEGIN;
-- BEGIN MAINTENANCE TASK
CREATE TABLE IF NOT EXISTS karda_kb.maintenance_task_event (
  task_id UUID NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_by VARCHAR(128) NOT NULL CHECK (length(btrim(created_by))>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(task_id,revision),
  UNIQUE(workspace_id,event_id)
);
-- END MAINTENANCE TASK
-- BEGIN MAINTENANCE TASK LOCKS
REVOKE UPDATE, DELETE ON karda_kb.maintenance_task_event FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.maintenance_task_event TO karda_svc;
-- END MAINTENANCE TASK LOCKS
COMMIT;
