BEGIN;
-- BEGIN KNOWLEDGE PUSH
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_change_event (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id UUID NOT NULL,event_type VARCHAR(40) NOT NULL,
 kb_id UUID,service_id UUID,consumer_id UUID,origin_key VARCHAR(180) NOT NULL UNIQUE,metadata JSONB NOT NULL,
 is_test BOOLEAN NOT NULL DEFAULT false,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_push_consumer (
 id UUID PRIMARY KEY,workspace_id UUID NOT NULL,created_by VARCHAR(128) NOT NULL,name VARCHAR(120) NOT NULL,
 endpoint TEXT NOT NULL,service_id UUID NOT NULL,event_types JSONB NOT NULL,kb_ids JSONB NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','paused','disabled')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),config_revision INTEGER NOT NULL DEFAULT 1,
 key_id UUID NOT NULL,key_cipher TEXT NOT NULL,verified_at TIMESTAMPTZ,scope_since TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_push_delivery (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),consumer_id UUID NOT NULL REFERENCES karda_kb.knowledge_push_consumer(id) ON DELETE CASCADE,
 event_id UUID NOT NULL REFERENCES karda_kb.knowledge_change_event(id) ON DELETE CASCADE,config_revision INTEGER NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','leased','retry','done','dead','suppressed','cancelled')),
 attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3),total_attempts INTEGER NOT NULL DEFAULT 0,
 lease_id UUID,lease_until TIMESTAMPTZ,retry_after TIMESTAMPTZ,error_code VARCHAR(80),http_status INTEGER,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(consumer_id,event_id),CHECK((state='leased')=(lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_push_attempt (
 delivery_id UUID NOT NULL REFERENCES karda_kb.knowledge_push_delivery(id) ON DELETE CASCADE,ordinal INTEGER NOT NULL,
 request_id UUID NOT NULL UNIQUE,key_id UUID NOT NULL,state VARCHAR(16) NOT NULL DEFAULT 'started' CHECK(state IN ('started','done','failed','suppressed')),
 http_status INTEGER,error_code VARCHAR(80),latency_ms INTEGER,started_at TIMESTAMPTZ NOT NULL DEFAULT now(),finished_at TIMESTAMPTZ,
 PRIMARY KEY(delivery_id,ordinal)
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_push_control (
 consumer_id UUID NOT NULL REFERENCES karda_kb.knowledge_push_consumer(id) ON DELETE CASCADE,revision INTEGER NOT NULL,
 event_id UUID NOT NULL,fingerprint VARCHAR(64) NOT NULL,action VARCHAR(16) NOT NULL,note TEXT NOT NULL,result JSONB NOT NULL,
 created_by VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(consumer_id,revision),UNIQUE(consumer_id,event_id)
);
-- END KNOWLEDGE PUSH
-- BEGIN KNOWLEDGE PUSH TRIGGERS
CREATE OR REPLACE FUNCTION karda_kb.capture_knowledge_change() RETURNS trigger LANGUAGE plpgsql AS $push$
DECLARE ws UUID; kind TEXT; kb UUID; svc UUID; meta JSONB; origin TEXT;
BEGIN
 IF TG_TABLE_NAME='semantic_release' THEN
  SELECT workspace_id INTO ws FROM karda_kb.knowledge_base WHERE id=NEW.kb_id;
  kind:='knowledge.published';kb:=NEW.kb_id;meta:=jsonb_build_object('releaseId',NEW.id,'generation',NEW.generation);origin:='release:'||NEW.id::text;
 ELSIF TG_TABLE_NAME='document' THEN
  IF NOT ((OLD.content_state='indexed' AND (NEW.content_state<>'indexed' OR NEW.active_chunk_version IS DISTINCT FROM OLD.active_chunk_version OR NEW.content_hash IS DISTINCT FROM OLD.content_hash)) OR (NEW.content_state IN ('deleted','archived') AND OLD.content_state NOT IN ('deleted','archived'))) THEN RETURN NEW;END IF;
  SELECT workspace_id INTO ws FROM karda_kb.knowledge_base WHERE id=NEW.kb_id;
  kind:='source.invalidated';kb:=NEW.kb_id;meta:=jsonb_build_object('documentId',NEW.id,'previousVersion',OLD.active_chunk_version,'currentVersion',NEW.active_chunk_version,'state',NEW.content_state);origin:='document:'||gen_random_uuid()::text;
 ELSIF TG_TABLE_NAME='knowledge_base' THEN
  IF NEW.publish_state IS NOT DISTINCT FROM OLD.publish_state THEN RETURN NEW;END IF;
  ws:=NEW.workspace_id;kb:=NEW.id;kind:='library.visibility_changed';meta:=jsonb_build_object('previousState',OLD.publish_state,'state',NEW.publish_state);origin:='visibility:'||gen_random_uuid()::text;
 ELSIF TG_TABLE_NAME='knowledge_service' THEN
  IF NEW.state IS NOT DISTINCT FROM OLD.state AND NEW.active_version IS NOT DISTINCT FROM OLD.active_version THEN RETURN NEW;END IF;
  ws:=NEW.workspace_id;svc:=NEW.id;kind:='service.changed';meta:=jsonb_build_object('state',NEW.state,'versionId',NEW.active_version,'revision',NEW.revision);origin:='service:'||gen_random_uuid()::text;
 ELSE RETURN NEW;END IF;
 IF ws IS NOT NULL THEN INSERT INTO karda_kb.knowledge_change_event(workspace_id,event_type,kb_id,service_id,origin_key,metadata) VALUES(ws,kind,kb,svc,origin,meta) ON CONFLICT(origin_key) DO NOTHING;END IF;
 RETURN NEW;
END $push$;
DROP TRIGGER IF EXISTS capture_release_change ON karda_kb.semantic_release;
CREATE TRIGGER capture_release_change AFTER INSERT ON karda_kb.semantic_release FOR EACH ROW EXECUTE FUNCTION karda_kb.capture_knowledge_change();
DROP TRIGGER IF EXISTS capture_document_change ON karda_kb.document;
CREATE TRIGGER capture_document_change AFTER UPDATE ON karda_kb.document FOR EACH ROW EXECUTE FUNCTION karda_kb.capture_knowledge_change();
DROP TRIGGER IF EXISTS capture_visibility_change ON karda_kb.knowledge_base;
CREATE TRIGGER capture_visibility_change AFTER UPDATE ON karda_kb.knowledge_base FOR EACH ROW EXECUTE FUNCTION karda_kb.capture_knowledge_change();
DROP TRIGGER IF EXISTS capture_service_change ON karda_kb.knowledge_service;
CREATE TRIGGER capture_service_change AFTER UPDATE ON karda_kb.knowledge_service FOR EACH ROW EXECUTE FUNCTION karda_kb.capture_knowledge_change();
-- END KNOWLEDGE PUSH TRIGGERS
-- BEGIN KNOWLEDGE PUSH LOCKS
REVOKE UPDATE,DELETE ON karda_kb.knowledge_change_event,karda_kb.knowledge_push_consumer,karda_kb.knowledge_push_delivery,karda_kb.knowledge_push_attempt,karda_kb.knowledge_push_control FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.knowledge_change_event,karda_kb.knowledge_push_consumer,karda_kb.knowledge_push_delivery,karda_kb.knowledge_push_attempt,karda_kb.knowledge_push_control TO karda_svc;
GRANT UPDATE(name,endpoint,service_id,event_types,kb_ids,state,revision,config_revision,key_id,key_cipher,verified_at,scope_since,updated_at) ON karda_kb.knowledge_push_consumer TO karda_svc;
GRANT UPDATE(state,attempt,total_attempts,lease_id,lease_until,retry_after,error_code,http_status,updated_at) ON karda_kb.knowledge_push_delivery TO karda_svc;
GRANT UPDATE(state,http_status,error_code,latency_ms,finished_at) ON karda_kb.knowledge_push_attempt TO karda_svc;
-- END KNOWLEDGE PUSH LOCKS
COMMIT;
