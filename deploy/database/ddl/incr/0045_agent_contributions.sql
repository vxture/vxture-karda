BEGIN;
-- BEGIN AGENT CONTRIBUTIONS
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_contribution (
 id UUID PRIMARY KEY,kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),workspace_id UUID NOT NULL,
 created_by VARCHAR(128) NOT NULL,product_code VARCHAR(32) NOT NULL,payload_version INTEGER NOT NULL DEFAULT 1,
 state VARCHAR(24) NOT NULL DEFAULT 'submitted' CHECK(state IN ('submitted','needs_changes','accepted','rejected','withdrawn')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),assignee VARCHAR(128),similar_hash VARCHAR(64) NOT NULL,
 plan_id UUID,artifact_document_id UUID,prepared_documents JSONB NOT NULL DEFAULT '[]',
 handoff_state VARCHAR(16) NOT NULL DEFAULT 'none' CHECK(handoff_state IN ('none','working','ready','failed')),
 lease_id UUID,lease_until TIMESTAMPTZ,error_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_contribution_version (
 contribution_id UUID NOT NULL REFERENCES karda_kb.knowledge_contribution(id),version INTEGER NOT NULL CHECK(version>0),
 payload JSONB NOT NULL,payload_hash VARCHAR(64) NOT NULL,created_by VARCHAR(128) NOT NULL,note TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(contribution_id,version)
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_contribution_event (
 contribution_id UUID NOT NULL REFERENCES karda_kb.knowledge_contribution(id),revision INTEGER NOT NULL CHECK(revision>0),
 request_id UUID NOT NULL,fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,result JSONB NOT NULL,
 created_by VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(contribution_id,revision),UNIQUE(contribution_id,request_id)
);
-- END AGENT CONTRIBUTIONS
-- BEGIN CONTRIBUTION PRODUCTION EVENTS
CREATE OR REPLACE FUNCTION karda_kb.capture_contribution_production() RETURNS trigger LANGUAGE plpgsql AS $contribution$
DECLARE c RECORD;
BEGIN
 IF NEW.state IS NOT DISTINCT FROM OLD.state THEN RETURN NEW;END IF;
 FOR c IN SELECT k.id,k.workspace_id,k.kb_id FROM karda_kb.knowledge_contribution k JOIN karda_kb.production_unit u ON u.plan_id=k.plan_id WHERE u.id=NEW.unit_id LOOP
  INSERT INTO karda_kb.knowledge_change_event(workspace_id,event_type,kb_id,origin_key,metadata) VALUES(c.workspace_id,'contribution.changed',c.kb_id,'contribution-production:'||gen_random_uuid()::text,jsonb_build_object('contributionId',c.id,'stepId',NEW.id,'kind',NEW.kind,'state',NEW.state));
 END LOOP;RETURN NEW;
END $contribution$;
DROP TRIGGER IF EXISTS contribution_production_change ON karda_kb.production_step;
CREATE TRIGGER contribution_production_change AFTER UPDATE ON karda_kb.production_step FOR EACH ROW EXECUTE FUNCTION karda_kb.capture_contribution_production();
-- END CONTRIBUTION PRODUCTION EVENTS
-- BEGIN AGENT CONTRIBUTION LOCKS
REVOKE UPDATE,DELETE ON karda_kb.knowledge_contribution,karda_kb.knowledge_contribution_version,karda_kb.knowledge_contribution_event FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.knowledge_contribution,karda_kb.knowledge_contribution_version,karda_kb.knowledge_contribution_event TO karda_svc;
GRANT UPDATE(payload_version,state,revision,assignee,similar_hash,plan_id,artifact_document_id,prepared_documents,handoff_state,lease_id,lease_until,error_code,updated_at) ON karda_kb.knowledge_contribution TO karda_svc;
-- END AGENT CONTRIBUTION LOCKS
COMMIT;
