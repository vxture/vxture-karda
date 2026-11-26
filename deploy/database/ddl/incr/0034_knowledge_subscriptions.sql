BEGIN;
-- BEGIN KNOWLEDGE SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_subscription (
  id UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  user_sub VARCHAR(128) NOT NULL,
  product_code VARCHAR(32) NOT NULL,
  name VARCHAR(120) NOT NULL CHECK (length(btrim(name))>0),
  window_request JSONB NOT NULL CHECK (jsonb_typeof(window_request)='object'),
  request_hash VARCHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  enabled BOOLEAN NOT NULL DEFAULT true,
  sequence INTEGER NOT NULL DEFAULT 0 CHECK (sequence>=0),
  ack_sequence INTEGER NOT NULL DEFAULT 0 CHECK (ack_sequence>=0 AND ack_sequence<=sequence),
  last_revision VARCHAR(64) CHECK (last_revision ~ '^[a-f0-9]{64}$'),
  delivery_revision INTEGER NOT NULL DEFAULT 0 CHECK (delivery_revision>=0),
  delivery_sequence INTEGER NOT NULL DEFAULT 0 CHECK (delivery_sequence>=0 AND delivery_sequence<=sequence),
  delivery_attempt INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempt BETWEEN 0 AND 3),
  delivery_status VARCHAR(16) NOT NULL DEFAULT 'ready',
  delivery_worker VARCHAR(80),
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  retry_after TIMESTAMPTZ,
  CONSTRAINT chk_subscription_delivery_status CHECK (delivery_status IN ('ready','leased','retry','dead','done','cancelled')),
  CONSTRAINT chk_subscription_delivery_lease CHECK ((delivery_status='leased')=(lease_id IS NOT NULL AND lease_until IS NOT NULL) AND (lease_id IS NULL)=(lease_until IS NULL)),
  CONSTRAINT chk_subscription_delivery_checkpoint CHECK ((delivery_status NOT IN ('leased','retry','dead') OR ack_sequence<delivery_sequence) AND (delivery_status<>'done' OR ack_sequence>=delivery_sequence)),
  CONSTRAINT chk_subscription_delivery_retry CHECK ((delivery_status='retry')=(retry_after IS NOT NULL)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_subscription_event (
  subscription_id UUID NOT NULL REFERENCES karda_kb.knowledge_subscription(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL CHECK (sequence>0),
  revision VARCHAR(64) NOT NULL CHECK (revision ~ '^[a-f0-9]{64}$'),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(subscription_id,sequence)
);
-- END KNOWLEDGE SUBSCRIPTIONS
-- BEGIN KNOWLEDGE SUBSCRIPTION LOCKS
REVOKE UPDATE, DELETE ON karda_kb.knowledge_subscription, karda_kb.knowledge_subscription_event FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.knowledge_subscription, karda_kb.knowledge_subscription_event TO karda_svc;
GRANT UPDATE (enabled,sequence,ack_sequence,last_revision,updated_at) ON karda_kb.knowledge_subscription TO karda_svc;
-- END KNOWLEDGE SUBSCRIPTION LOCKS
COMMIT;
