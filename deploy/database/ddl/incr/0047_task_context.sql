BEGIN;
ALTER TABLE karda_kb.knowledge_service_call ADD COLUMN IF NOT EXISTS context_metadata JSONB;
ALTER TABLE karda_kb.knowledge_service_call DROP CONSTRAINT IF EXISTS knowledge_service_call_capability_check;
ALTER TABLE karda_kb.knowledge_service_call ADD CONSTRAINT knowledge_service_call_capability_check CHECK(capability IN ('facts','topics','source','package','context','visual'));
GRANT UPDATE(context_metadata) ON karda_kb.knowledge_service_call TO karda_svc;
COMMIT;
