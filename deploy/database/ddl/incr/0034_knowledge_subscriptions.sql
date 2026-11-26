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
