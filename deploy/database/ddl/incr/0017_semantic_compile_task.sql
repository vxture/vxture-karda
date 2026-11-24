BEGIN;
-- BEGIN SEMANTIC TASK
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='karda_kb' AND table_name='semantic_compile_run' AND column_name='kb_id')
    AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='karda_kb' AND table_name='semantic_compile_run' AND column_name='id') THEN
    CREATE UNIQUE INDEX IF NOT EXISTS uidx_semantic_compile_task_scope ON karda_kb.semantic_compile_run(kb_id,id);
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS karda_kb.semantic_compile_task (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
  created_by VARCHAR(128) NOT NULL,
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  snapshot_hash VARCHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','completed','needs_review','failed','suspended')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  run_id UUID,
  result JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(result)='object'),
  error_code VARCHAR(128),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(kb_id,run_id) REFERENCES karda_kb.semantic_compile_run(kb_id,id),
  CHECK ((state='running')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((state='completed')=(run_id IS NOT NULL))
);
-- END SEMANTIC TASK
-- BEGIN SEMANTIC TASK LOCKS
GRANT SELECT, INSERT ON karda_kb.semantic_compile_task TO karda_svc;
REVOKE UPDATE, DELETE ON karda_kb.semantic_compile_task FROM karda_svc;
GRANT UPDATE (state,attempt,lease_id,lease_until,run_id,result,error_code,updated_at)
  ON karda_kb.semantic_compile_task TO karda_svc;
-- END SEMANTIC TASK LOCKS
COMMIT;
