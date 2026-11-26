BEGIN;
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS delivery_revision INTEGER NOT NULL DEFAULT 0 CHECK (delivery_revision>=0);
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS delivery_sequence INTEGER NOT NULL DEFAULT 0 CHECK (delivery_sequence>=0 AND delivery_sequence<=sequence);
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS delivery_attempt INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempt BETWEEN 0 AND 3);
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(16) NOT NULL DEFAULT 'ready';
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS delivery_worker VARCHAR(80);
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS lease_id UUID;
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ;
ALTER TABLE karda_kb.knowledge_subscription ADD COLUMN IF NOT EXISTS retry_after TIMESTAMPTZ;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_subscription_delivery_status' AND conrelid='karda_kb.knowledge_subscription'::regclass) THEN ALTER TABLE karda_kb.knowledge_subscription ADD CONSTRAINT chk_subscription_delivery_status CHECK (delivery_status IN ('ready','leased','retry','dead','done','cancelled')); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_subscription_delivery_lease' AND conrelid='karda_kb.knowledge_subscription'::regclass) THEN ALTER TABLE karda_kb.knowledge_subscription ADD CONSTRAINT chk_subscription_delivery_lease CHECK ((delivery_status='leased')=(lease_id IS NOT NULL AND lease_until IS NOT NULL) AND (lease_id IS NULL)=(lease_until IS NULL)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_subscription_delivery_retry' AND conrelid='karda_kb.knowledge_subscription'::regclass) THEN ALTER TABLE karda_kb.knowledge_subscription ADD CONSTRAINT chk_subscription_delivery_retry CHECK ((delivery_status='retry')=(retry_after IS NOT NULL)); END IF; END $$;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_subscription_delivery_checkpoint' AND conrelid='karda_kb.knowledge_subscription'::regclass) THEN ALTER TABLE karda_kb.knowledge_subscription ADD CONSTRAINT chk_subscription_delivery_checkpoint CHECK ((delivery_status NOT IN ('leased','retry','dead') OR ack_sequence<delivery_sequence) AND (delivery_status<>'done' OR ack_sequence>=delivery_sequence)); END IF; END $$;
UPDATE karda_kb.knowledge_subscription SET delivery_status='cancelled' WHERE NOT enabled AND delivery_revision=0 AND delivery_status='ready';
-- BEGIN KNOWLEDGE DELIVERY
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_delivery_event (
  subscription_id UUID NOT NULL REFERENCES karda_kb.knowledge_subscription(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  request_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  action VARCHAR(16) NOT NULL CHECK (action IN ('claim','complete','fail','redrive','cancel')),
  status VARCHAR(16) NOT NULL CHECK (status IN ('ready','leased','retry','dead','done','cancelled')),
  sequence INTEGER NOT NULL CHECK (sequence>=0),
  attempt INTEGER NOT NULL CHECK (attempt BETWEEN 0 AND 3),
  worker VARCHAR(80),
  note TEXT,
  reason VARCHAR(32) CHECK (reason IN ('transient','permanent','attempt_limit')),
  window_revision VARCHAR(64) CHECK (window_revision ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(subscription_id,revision),
  UNIQUE(subscription_id,request_id)
);
-- END KNOWLEDGE DELIVERY
-- BEGIN KNOWLEDGE DELIVERY LOCKS
REVOKE UPDATE, DELETE ON karda_kb.knowledge_delivery_event FROM karda_svc;
GRANT SELECT, INSERT ON karda_kb.knowledge_delivery_event TO karda_svc;
GRANT UPDATE (delivery_revision,delivery_sequence,delivery_attempt,delivery_status,delivery_worker,lease_id,lease_until,retry_after) ON karda_kb.knowledge_subscription TO karda_svc;
-- END KNOWLEDGE DELIVERY LOCKS
COMMIT;
