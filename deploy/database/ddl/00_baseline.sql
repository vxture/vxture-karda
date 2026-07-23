-- Business-face DB baseline (product_240 section 2.4, data_platform_100 section
-- 2.3.1). Single DDL authority - hand-written, create-once (never ALTER an
-- existing table here; structure changes ship as numbered incr/ increments via
-- db-init). Three contract schemas ship from the factory; N domain schemas are a
-- product blank zone (must not use the reserved contract-schema names).
--
-- Naming (data_platform_100 section 3.2): uuid PK gen_random_uuid(); TIMESTAMPTZ
-- created_at/updated_at/deleted_at; status VARCHAR(32)+CHECK (never PG ENUM);
-- idx_/uidx_/fk_/chk_ prefixes. Anchor columns (id, *_no, created_at) are
-- immutable - locked in 98_column_locks.sql.
--
-- Product-side rows hold only platform REFERENCE keys (workspace_id/tenant_id/
-- sub); they are platform-issued, never product-declared, and are NOT a mirror
-- of the platform's four-layer identity model (data_platform_100 section 2.3.2).

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()

-- ===========================================================================
-- vx_provision  (platform-driven provisioning + inbound webhook event log)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS vx_provision;

CREATE TABLE IF NOT EXISTS vx_provision.app_instance (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref] authoritative isolation key
  tenant_id      UUID,                                -- [ref] rollup only
  product_code   VARCHAR(32) NOT NULL,                -- [ref]
  status         VARCHAR(32) NOT NULL DEFAULT 'pending'
                   CONSTRAINT chk_app_instance_status
                   CHECK (status IN ('pending', 'provisioned', 'deprovisioned')),
  env            VARCHAR(32) NOT NULL DEFAULT 'prod'
                   CONSTRAINT chk_app_instance_env CHECK (env IN ('beta', 'prod')),
  provisioned_at TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_app_instance_ws_product UNIQUE (workspace_id, product_code)
);

-- Inbound webhook idempotency ledger (append-only; delivery_id = payload.id).
CREATE TABLE IF NOT EXISTS vx_provision.webhook_delivery (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id  VARCHAR(128) NOT NULL,                 -- [ref] = payload.id / X-Vxture-Delivery
  type         VARCHAR(64) NOT NULL,
  occurred_at  TIMESTAMPTZ,
  result       VARCHAR(32) NOT NULL DEFAULT 'processed'
                 CONSTRAINT chk_webhook_delivery_result
                 CHECK (result IN ('processed', 'duplicate', 'stale', 'ignored')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_webhook_delivery_delivery_id UNIQUE (delivery_id)
);

-- Per (workspace_id, product_code) processed-seq watermark (drop stale/reordered).
CREATE TABLE IF NOT EXISTS vx_provision.provision_seq (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,                         -- [ref]
  product_code VARCHAR(32) NOT NULL,                  -- [ref]
  last_seq     BIGINT NOT NULL DEFAULT 0,             -- [ref] = payload.seq
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_provision_seq_ws_product UNIQUE (workspace_id, product_code)
);

-- ===========================================================================
-- local_authz  (product members + function roles; product-owned, NOT a mirror
-- of the platform governance role catalog access.roles)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS local_authz;

-- Lazy subset: upserted on first login sighting of (workspace_id, sub). This is
-- NOT the full/real-time mirror of tenancy.workspace_memberships.
CREATE TABLE IF NOT EXISTS local_authz.member (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   UUID NOT NULL,                       -- [ref]
  sub            VARCHAR(128) NOT NULL,               -- [ref] full "usr_<uuid>"
  display_name   VARCHAR(255),                        -- platform cache (may go stale)
  avatar_hash    VARCHAR(128),                        -- platform cache
  status         VARCHAR(32) NOT NULL DEFAULT 'active'
                   CONSTRAINT chk_member_status CHECK (status IN ('active', 'inactive')),
  first_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_member_ws_sub UNIQUE (workspace_id, sub)
);

-- Product function-role catalog (product seed; e.g. reviewer/editor). This is
-- NOT the platform governance role domain (owner/manager/member/readonly/guest).
CREATE TABLE IF NOT EXISTS local_authz.role (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code   VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_role_role_code UNIQUE (role_code)
);

CREATE TABLE IF NOT EXISTS local_authz.permission (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  perm_code   VARCHAR(64) NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_permission_perm_code UNIQUE (perm_code)
);

CREATE TABLE IF NOT EXISTS local_authz.member_role (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL,
  role_id     UUID NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_member_role_member FOREIGN KEY (member_id) REFERENCES local_authz.member (id) ON DELETE CASCADE,
  CONSTRAINT fk_member_role_role FOREIGN KEY (role_id) REFERENCES local_authz.role (id) ON DELETE CASCADE,
  CONSTRAINT uidx_member_role_member_role UNIQUE (member_id, role_id)
);

CREATE TABLE IF NOT EXISTS local_authz.role_permission (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id        UUID NOT NULL,
  permission_id  UUID NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_role_permission_role FOREIGN KEY (role_id) REFERENCES local_authz.role (id) ON DELETE CASCADE,
  CONSTRAINT fk_role_permission_permission FOREIGN KEY (permission_id) REFERENCES local_authz.permission (id) ON DELETE CASCADE,
  CONSTRAINT uidx_role_permission_role_perm UNIQUE (role_id, permission_id)
);

-- ===========================================================================
-- local_usage  (local counter-usage buffer; platform metering is the SoT)
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS local_usage;

-- Only COUNTER usage is buffered here; gauge is a direct PUT, caps are counted
-- locally. idempotency_key is mandatory (defeats replay/double-count).
CREATE TABLE IF NOT EXISTS local_usage.raw (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     UUID NOT NULL,                     -- [ref]
  metric           VARCHAR(128) NOT NULL,             -- [ref] must hit a platform metric registry key
  amount           BIGINT NOT NULL,
  idempotency_key  VARCHAR(128) NOT NULL,
  flushed          BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_raw_amount CHECK (amount > 0),
  CONSTRAINT uidx_raw_idempotency_key UNIQUE (idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_raw_unflushed ON local_usage.raw (flushed) WHERE flushed = false;

-- Product-local flush watermark (no platform counterpart).
CREATE TABLE IF NOT EXISTS local_usage.checkpoint (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                        -- [ref]
  metric        VARCHAR(128) NOT NULL,
  flushed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_checkpoint_ws_metric UNIQUE (workspace_id, metric)
);

-- ===========================================================================
-- karda_kb  (karda's own domain: the knowledge-base object model)
--
-- Authority: docs/30-design/210-data-model.md, which realizes
-- docs/30-design/100-kb-model.md. Read 210 before changing anything here - the
-- shapes below encode design decisions, not just storage.
--
-- Domain schema, NOT a contract schema: the three above ship from the factory
-- and are never extended; this one is karda's blank zone (product_240 2.9).
-- ===========================================================================
CREATE SCHEMA IF NOT EXISTS karda_kb;

-- Processing template: decides how a Document is parsed and chunked (RAGFlow
-- chunk-method analogue). v1 ships six presets and org may only tune params -
-- is_preset exists so opening org-authored templates in v2 needs no migration.
CREATE TABLE IF NOT EXISTS karda_kb.processing_template (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code   VARCHAR(64) NOT NULL,
  name            VARCHAR(255) NOT NULL,
  version         INTEGER NOT NULL DEFAULT 1,
  default_params  JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_preset       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_processing_template_code UNIQUE (template_code)
);

-- Content template: declares an Entry's field structure (Guru card template /
-- SharePoint content type analogue). Platform presets + org-authored; there is
-- deliberately no user-level scope (100-kb-model 2.3).
CREATE TABLE IF NOT EXISTS karda_kb.content_template (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code  VARCHAR(64) NOT NULL,
  name           VARCHAR(255) NOT NULL,
  version        INTEGER NOT NULL DEFAULT 1,
  scope          VARCHAR(16) NOT NULL DEFAULT 'platform'
                   CONSTRAINT chk_content_template_scope
                   CHECK (scope IN ('platform', 'org')),
  workspace_id   UUID,                                -- [ref] set for scope='org'
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_content_template_scope_ws
    CHECK ((scope = 'org') = (workspace_id IS NOT NULL)),
  CONSTRAINT uidx_content_template_identity
    UNIQUE (scope, workspace_id, template_code, version)
);

-- Field declarations. retrieval_role is what makes a field searchable,
-- filterable, or merely stored - Entry indexing reads it (100-kb-model 6).
-- ontos_type is stored but NOT consumed in v1 (graph extraction is v2).
CREATE TABLE IF NOT EXISTS karda_kb.content_template_field (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL,
  field_name     VARCHAR(64) NOT NULL,
  value_type     VARCHAR(16) NOT NULL
                   CONSTRAINT chk_ct_field_value_type
                   CHECK (value_type IN ('string', 'number', 'datetime', 'enum', 'richtext')),
  enum_values    JSONB,
  required       BOOLEAN NOT NULL DEFAULT false,
  retrieval_role VARCHAR(16) NOT NULL DEFAULT 'store_only'
                   CONSTRAINT chk_ct_field_retrieval_role
                   CHECK (retrieval_role IN ('search_text', 'filterable', 'store_only')),
  ontos_type     VARCHAR(128),
  position       INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_ct_field_template FOREIGN KEY (template_id)
    REFERENCES karda_kb.content_template (id) ON DELETE CASCADE,
  CONSTRAINT uidx_ct_field_template_name UNIQUE (template_id, field_name)
);

-- The single library type. Permission, publish ladder and attachment all anchor
-- HERE and nowhere else (100-kb-model 3) - putting publish state on content rows
-- would create a second authorization surface.
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_base (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                  UUID NOT NULL,        -- [ref] governance anchor
  owner_type                    VARCHAR(16) NOT NULL
                                  CONSTRAINT chk_kb_owner_type
                                  CHECK (owner_type IN ('platform', 'tenant', 'user', 'product')),
  owner_sub                     VARCHAR(128),         -- [ref] set for owner_type='user'
  name                          VARCHAR(255) NOT NULL,
  description                   TEXT,
  publish_state                 VARCHAR(32) NOT NULL DEFAULT 'private'
                                  CONSTRAINT chk_kb_publish_state
                                  CHECK (publish_state IN ('private', 'ws_published', 'org_published')),
  origin_kb_id                  UUID,                 -- P-tier instantiation lineage
  origin_snapshot_at            TIMESTAMPTZ,
  processing_template_id        UUID,
  processing_params             JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding_model               VARCHAR(128),         -- library-locked Atlas model version
  fulltext_enabled              BOOLEAN NOT NULL DEFAULT true,
  graph_enabled                 BOOLEAN NOT NULL DEFAULT false,
  retrieval_defaults            JSONB NOT NULL DEFAULT '{}'::jsonb,
  governance_enabled            BOOLEAN NOT NULL DEFAULT false,
  default_verifier              VARCHAR(128),
  default_verify_interval_days  INTEGER,
  exempt_synced_content         BOOLEAN NOT NULL DEFAULT true,
  deleted_at                    TIMESTAMPTZ,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_kb_owner_sub
    CHECK ((owner_type = 'user') = (owner_sub IS NOT NULL)),
  CONSTRAINT fk_kb_processing_template FOREIGN KEY (processing_template_id)
    REFERENCES karda_kb.processing_template (id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_kb_ws_name
  ON karda_kb.knowledge_base (workspace_id, name) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_kb_owner
  ON karda_kb.knowledge_base (owner_type, owner_sub);

-- Optional, SINGLE-LEVEL, zero permission semantics. The absence of parent_id is
-- the constraint: nesting is not supported, deep organisation means a new KB
-- (100-kb-model 3).
CREATE TABLE IF NOT EXISTS karda_kb.folder (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id       UUID NOT NULL,
  name        VARCHAR(255) NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_folder_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  CONSTRAINT uidx_folder_kb_name UNIQUE (kb_id, name)
);

-- Business-segment field declarations. filterable is a WHITELIST (default off) -
-- multi-tenant filter-index cost is why this differs from Dify's filter-anything
-- model. The per-KB filterable cap is enforced in the application layer, not
-- here; see 210-data-model.md 3.5 for why.
CREATE TABLE IF NOT EXISTS karda_kb.kb_metadata_field (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id        UUID NOT NULL,
  field_name   VARCHAR(64) NOT NULL,
  value_type   VARCHAR(16) NOT NULL
                 CONSTRAINT chk_kb_meta_value_type
                 CHECK (value_type IN ('string', 'number', 'datetime', 'enum')),
  enum_values  JSONB,
  filterable   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_kb_meta_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  CONSTRAINT uidx_kb_meta_kb_field UNIQUE (kb_id, field_name)
);

-- File-type content. No 'draft' state: a file is in processing the moment it
-- arrives (100-kb-model 5.1). 'failed' is an explicit residency state - visible
-- and retryable, never silently dropped.
CREATE TABLE IF NOT EXISTS karda_kb.document (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id                   UUID NOT NULL,
  folder_id               UUID,
  title                   VARCHAR(512) NOT NULL,
  mime                    VARCHAR(128),
  size_bytes              BIGINT,
  -- Ingestion KIND, deliberately connector-agnostic: 'connector' covers every
  -- external source karda attaches (Arda is simply the first of them, treated as
  -- an internal third party). Naming a specific connector here would make adding
  -- the next one a production structure change; the connector's identity lives
  -- in connector_code, which is data.
  source                  VARCHAR(32) NOT NULL
                            CONSTRAINT chk_document_source
                            CHECK (source IN ('upload', 'api', 'connector')),
  connector_code          VARCHAR(64),                -- e.g. 'arda'; NULL for upload/api
  source_ref              JSONB,                      -- source_doc_id / uri / external_version
  -- Pointer into karda's OWN object storage for the retained raw file
  -- (110-processing 1: raw preservation - rechunk without reparsing, reindex
  -- without redownloading). Karda holds its own copy; it does not depend on a
  -- connector remaining reachable to serve or rebuild its content.
  storage_ref             VARCHAR(512),
  content_hash            VARCHAR(80),
  processing_template_id  UUID,                       -- document-level override
  content_state           VARCHAR(32) NOT NULL DEFAULT 'processing'
                            CONSTRAINT chk_document_content_state
                            CHECK (content_state IN ('processing', 'indexed', 'failed', 'archived', 'deleted')),
  failure_reason          TEXT,
  failed_at               TIMESTAMPTZ,
  verification_state      VARCHAR(32) NOT NULL DEFAULT 'unverified'
                            CONSTRAINT chk_document_verification_state
                            CHECK (verification_state IN ('unverified', 'verified', 'stale')),
  verifier                VARCHAR(128),
  verified_at             TIMESTAMPTZ,
  expires_at              TIMESTAMPTZ,
  sensitivity             VARCHAR(32),
  business_meta           JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_in_product      VARCHAR(32),
  created_by              VARCHAR(128),               -- [ref]
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_document_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  CONSTRAINT fk_document_folder FOREIGN KEY (folder_id)
    REFERENCES karda_kb.folder (id) ON DELETE SET NULL,
  CONSTRAINT fk_document_processing_template FOREIGN KEY (processing_template_id)
    REFERENCES karda_kb.processing_template (id),
  -- A connector-sourced document must say which connector; upload/api must not.
  CONSTRAINT chk_document_connector_code
    CHECK ((source = 'connector') = (connector_code IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_document_kb_state
  ON karda_kb.document (kb_id, content_state);
-- Same-origin same-content dedup: the storage-layer half of the content_hash
-- idempotency in 110-processing 7. connector_code is coalesced because a NULL
-- would make every upload distinct from every other upload under SQL's
-- NULL <> NULL rule, silently disabling dedup on exactly the ingestion path
-- that needs it most.
CREATE UNIQUE INDEX IF NOT EXISTS uidx_document_kb_origin_hash
  ON karda_kb.document (kb_id, source, coalesce(connector_code, ''), content_hash)
  WHERE content_hash IS NOT NULL AND content_state <> 'deleted';
-- Tombstone deletes from any connector locate rows by the envelope's stable id.
CREATE INDEX IF NOT EXISTS idx_document_source_doc_id
  ON karda_kb.document (connector_code, (source_ref ->> 'source_doc_id'))
  WHERE source = 'connector';

-- Item-type content. HAS a 'draft' state (editing does not enter the index).
-- template_version is load-bearing: template evolution bumps the version and
-- existing entries keep pointing at the old one (lazy migration, 100-kb-model
-- 2.3) - without it a version bump would silently reinterpret stored fields.
CREATE TABLE IF NOT EXISTS karda_kb.entry (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id                UUID NOT NULL,
  folder_id            UUID,
  title                VARCHAR(512),
  content_template_id  UUID NOT NULL,
  template_version     INTEGER NOT NULL DEFAULT 1,
  fields               JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_state        VARCHAR(32) NOT NULL DEFAULT 'draft'
                         CONSTRAINT chk_entry_content_state
                         CHECK (content_state IN ('draft', 'processing', 'indexed', 'failed', 'archived', 'deleted')),
  failure_reason       TEXT,
  failed_at            TIMESTAMPTZ,
  verification_state   VARCHAR(32) NOT NULL DEFAULT 'unverified'
                         CONSTRAINT chk_entry_verification_state
                         CHECK (verification_state IN ('unverified', 'verified', 'stale')),
  verifier             VARCHAR(128),
  verified_at          TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ,
  sensitivity          VARCHAR(32),
  business_meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_in_product   VARCHAR(32),
  created_by           VARCHAR(128),                  -- [ref]
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_entry_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  CONSTRAINT fk_entry_folder FOREIGN KEY (folder_id)
    REFERENCES karda_kb.folder (id) ON DELETE SET NULL,
  CONSTRAINT fk_entry_content_template FOREIGN KEY (content_template_id)
    REFERENCES karda_kb.content_template (id)
);
CREATE INDEX IF NOT EXISTS idx_entry_kb_state
  ON karda_kb.entry (kb_id, content_state);

-- Derived recall unit, Document only (an Entry is itself the recall unit).
-- The vector lives in the index store, not here; vector_ref is the pointer.
-- No writable columns at all (98_column_locks) - chunks are rebuilt, never
-- edited in place, so index/source divergence cannot be introduced by a stray
-- UPDATE.
CREATE TABLE IF NOT EXISTS karda_kb.chunk (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL,
  ordinal      INTEGER NOT NULL,
  text         TEXT NOT NULL,
  token_count  INTEGER,
  vector_ref   VARCHAR(128),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_chunk_document FOREIGN KEY (document_id)
    REFERENCES karda_kb.document (id) ON DELETE CASCADE,
  CONSTRAINT uidx_chunk_document_ordinal UNIQUE (document_id, ordinal)
);
