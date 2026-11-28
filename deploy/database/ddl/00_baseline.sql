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
  payload_hash VARCHAR(64),                         -- legacy receipts remain NULL
  delivery_id  VARCHAR(128) NOT NULL,                 -- [ref] = payload.id / X-Vxture-Delivery
  type         VARCHAR(64) NOT NULL,
  occurred_at  TIMESTAMPTZ,
  result       VARCHAR(32) NOT NULL DEFAULT 'processed'
                 CONSTRAINT chk_webhook_delivery_result
                 CHECK (result IN ('processed', 'duplicate', 'stale', 'ignored')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_webhook_delivery_delivery_id UNIQUE (delivery_id)
);

-- Immutable scope recovered only from signed events / verified read reconciliation.
CREATE TABLE IF NOT EXISTS vx_provision.provision_anchor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  product_code VARCHAR(32) NOT NULL,
  tenant_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_provision_anchor_ws_product UNIQUE (workspace_id, product_code)
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
  attempts         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error       VARCHAR(200),
  flushed_at       TIMESTAMPTZ,
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
  -- 这个库的**真相住在哪**(owner 2026-08-30):
  --   owned   自主掌握——上传 / API 写入,真相在这里
  --   synced  外部采集——真相在源头
  --
  -- 治理规则(kb/lib/state.ts)本来就写着「同步内容的真相在源头,本地复验是演戏」,
  -- 也就是说产品**早就知道**这是两种真相模型;缺的只是一个让**库**说出自己是哪一种
  -- 的地方。此前答案靠逐条 `document.source` 推断——于是「这个库可不可信」没有一个
  -- 答案,只有 N 个。治理、删除(I4)、对账三条规则各自独立地记着这条区分,而一条
  -- 要在三处被记住的规则,迟早在其中一处被忘掉。
  --
  -- 它是**默认而不是约束**:采集库仍可手工补充(「规章库 + 几份自己写的解读」是真
  -- 场景),补充的内容因为 `synced=false` 而照常纳入治理——那是对的,它的真相在这里。
  source_mode                   VARCHAR(16) NOT NULL DEFAULT 'owned'
                                  CONSTRAINT chk_kb_source_mode
                                  CHECK (source_mode IN ('owned', 'synced')),
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
  -- The chunk version retrieval reads. Set by the atomic swap at commit; NULL
  -- until a document has successfully committed an index (110-processing 6).
  active_chunk_version    INTEGER,
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

-- Subscription of a knowledge base to one syncable range on an external source
-- (220-connector-framework section 3). Connector-agnostic on purpose: Arda is
-- simply one connector_code among the ones karda will open over time, so nothing
-- about a specific connector appears in this shape.
CREATE TABLE IF NOT EXISTS karda_kb.binding (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id               UUID NOT NULL,
  connector_code      VARCHAR(64) NOT NULL,
  external_source_id  VARCHAR(255) NOT NULL,          -- the connector-side range id
  mode                VARCHAR(32) NOT NULL DEFAULT 'backfill'
                        CONSTRAINT chk_binding_mode
                        CHECK (mode IN ('backfill', 'incremental')),
  state               VARCHAR(32) NOT NULL DEFAULT 'active'
                        CONSTRAINT chk_binding_state
                        CHECK (state IN ('active', 'paused', 'revoked')),
  cursor              VARCHAR(512),                   -- karda-side consumption checkpoint
  last_synced_at      TIMESTAMPTZ,
  created_by          VARCHAR(128),                   -- [ref] the owner who registered it (OBO)
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_binding_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  CONSTRAINT uidx_binding_kb_connector_source
    UNIQUE (kb_id, connector_code, external_source_id)
);
CREATE INDEX IF NOT EXISTS idx_binding_state
  ON karda_kb.binding (state, connector_code);

-- Derived recall unit, Document only (an Entry is itself the recall unit).
-- The vector lives in the index store, not here; vector_ref is the pointer.
-- No writable columns at all (98_column_locks) - chunks are rebuilt, never
-- edited in place, so index/source divergence cannot be introduced by a stray
-- UPDATE.
CREATE TABLE IF NOT EXISTS karda_kb.chunk (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id  UUID NOT NULL,
  version      INTEGER NOT NULL,                    -- atomic-replace version (110-processing 6)
  ordinal      INTEGER NOT NULL,
  text         TEXT NOT NULL,
  token_count  INTEGER,
  -- Where this chunk came from in the document's CANONICAL text (line endings
  -- normalised, nothing else - kb/processing/ir.ts). The assertion layer anchors
  -- its spans to the same offset space, which is what turns "which assertions
  -- does this citation rest on" into a range intersection instead of a guess.
  -- NULLABLE: chunks written before incr/0007 have no offsets and cannot get
  -- them without a reparse. NULL means unknown, never 0.
  start_offset INTEGER,
  end_offset   INTEGER,
  vector_ref   VARCHAR(128),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_chunk_document FOREIGN KEY (document_id)
    REFERENCES karda_kb.document (id) ON DELETE CASCADE,
  CONSTRAINT uidx_chunk_document_version_ordinal UNIQUE (document_id, version, ordinal),
  -- Both or neither, and ordered: a half-populated pair is a range that cannot
  -- be intersected, which is worse than no range at all.
  -- Three-valued logic, deliberately explicit: with start = 10 and end = NULL
  -- the naive form evaluates to NULL, and a CHECK constraint PASSES on NULL.
  -- A live probe caught half a range being accepted by a constraint whose own
  -- comment said "both or neither".
  CONSTRAINT chk_chunk_source_range CHECK (
    (start_offset IS NULL) = (end_offset IS NULL)
    AND (start_offset IS NULL OR (start_offset >= 0 AND end_offset > start_offset))
  )
);
-- idx_chunk_source_range 引用 start_offset(incr/0007 才补的列)。守卫的理由与下面
-- idx_chunk_active 完全相同,而这一条当初漏了守卫:2026-08-28 的生产 db-init 就
-- 死在这里 —— chunk 表早已存在,CREATE TABLE IF NOT EXISTS 整张跳过,于是这条
-- 独立语句在一个没有 start_offset 的表上执行,ERROR 让 baseline 在 incr/0007
-- (它会补列并建同一个索引)跑到之前就中断了。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'karda_kb' AND table_name = 'chunk' AND column_name = 'start_offset'
  ) THEN
      CREATE INDEX IF NOT EXISTS idx_chunk_source_range
      ON karda_kb.chunk (document_id, version, start_offset);
  END IF;
END $$;
-- idx_chunk_active references `version`. On a fresh DB the column exists (just
-- created above) so the index is built here, keeping baseline a complete
-- provision. On a LIVE pre-versioning table the CREATE TABLE above is a no-op
-- and `version` does not exist yet - so guard on the column, or this standalone
-- statement fails before incr/0001 (which adds the column AND this index) runs.
-- db-init applies baseline THEN incr, so the live path is covered by 0001.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'karda_kb' AND table_name = 'chunk' AND column_name = 'version'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_chunk_active
      ON karda_kb.chunk (document_id, version);
  END IF;
END $$;

-- The chunk's vector, in the index store the chunk.vector_ref comment above
-- points at (ADR-002: the index store IS Postgres for now - vectors as JSONB,
-- similarity in-process; pgvector is the named scale path). One row per
-- embedded chunk, written in the SAME transaction as the chunk's version
-- commit; model_code is the KD-107 vector-space lock - recall only compares
-- vectors under one model_code. Rebuilt-never-edited like chunk itself
-- (insert/delete only, no UPDATE grant); deletes ride the chunk cascade.
-- NOTE (live DB): added by incr/0003, which db-init applies AFTER 97/98, so its
-- service-role grants travel with that increment, not with 97.
CREATE TABLE IF NOT EXISTS karda_kb.chunk_embedding (
  chunk_id    UUID PRIMARY KEY,
  model_code  VARCHAR(128) NOT NULL,             -- the embedding-model lock (KD-107)
  dim         INTEGER NOT NULL,
  vector      JSONB NOT NULL,                    -- float array; ADR-002
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_chunk_embedding_chunk FOREIGN KEY (chunk_id)
    REFERENCES karda_kb.chunk (id) ON DELETE CASCADE
);

-- A user's per-product attachment list (definition 4.8; karda.attach_kb /
-- detach_kb / create_kb-auto-attach). The permission unit is the library; this is
-- a working-set link, NOT an authorization surface - a row here means "this user
-- has this library in their attachment list for this product", nothing more.
-- Insert/delete only (no writable columns): attaching and detaching are the only
-- operations, so 98_column_locks grants no UPDATE.
-- NOTE (live DB): added by incr/0002, which db-init applies AFTER 97/98, so its
-- service-role grants travel with that increment, not with 97.
CREATE TABLE IF NOT EXISTS karda_kb.kb_attachment (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,
  user_sub      VARCHAR(128) NOT NULL,
  product_code  VARCHAR(32) NOT NULL,          -- the calling product (S2S act.sub)
  kb_id         UUID NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_kb_attachment_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  CONSTRAINT uidx_kb_attachment_ws_user_product_kb
    UNIQUE (workspace_id, user_sub, product_code, kb_id)
);
CREATE INDEX IF NOT EXISTS idx_kb_attachment_lookup
  ON karda_kb.kb_attachment (workspace_id, user_sub, product_code);

-- ===== karda_kb: ops read models (240-ops-read-models) =====
-- The fact sources behind the 加工管道 and 供给通道 domains. Until these tables
-- existed both domains queried NO database at all - every task, every call on
-- those pages was a demo constant. See 240 section 1.
-- NOTE (live DB): added by incr/0004, which db-init applies AFTER 97/98, so both
-- the service-role grants AND the column-lock whitelist travel with that
-- increment, not with 97/98 (incr/README.md).

-- One processing task = one document going through the five stages
-- (110-processing 2). Rows are what make the pipeline OBSERVABLE; making it
-- RESUMABLE across a restart is a further change this table enables but does not
-- itself perform (240 section 4.1).
CREATE TABLE IF NOT EXISTS karda_kb.processing_task (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         UUID NOT NULL,
  kb_id               UUID NOT NULL,                   -- deliberately denormalised; see 240 4.1
  -- KD-211: extraction is its own pass, not a sixth stage of processing. The two
  -- have different invalidation keys, and fusing them would let a re-embed
  -- discard assertions a human already adjudicated. Written at INSERT, never
  -- updated - a task does not change species, so it carries no UPDATE grant.
  kind                VARCHAR(32) NOT NULL DEFAULT 'processing'
                        CONSTRAINT chk_processing_task_kind
                        CHECK (kind IN ('processing', 'extraction')),
  tier                VARCHAR(32) NOT NULL DEFAULT 'interactive'
                        CONSTRAINT chk_processing_task_tier
                        CHECK (tier IN ('interactive', 'sync', 'bulk')),
  state               VARCHAR(32) NOT NULL DEFAULT 'queued'
                        CONSTRAINT chk_processing_task_state
                        CHECK (state IN ('queued', 'running', 'suspended', 'failed', 'done')),
  current_stage       VARCHAR(32) NOT NULL DEFAULT 'fetch'
                        CONSTRAINT chk_processing_task_stage
                        -- 'extract' is an extraction task's ONLY stage: the run is
                        -- all-windows-or-nothing, so there is no resumable midpoint
                        -- for sub-stages to record. The processing pipeline's five
                        -- stages are unchanged.
                        CHECK (current_stage IN ('fetch', 'parse', 'chunk', 'embed', 'commit', 'extract')),
  -- The retry judgment as a COLUMN, not a string to be parsed out of
  -- failure_reason: quota -> suspend, transient -> back off, permanent -> park.
  failure_class       VARCHAR(32)
                        CONSTRAINT chk_processing_task_failure_class
                        -- 'unavailable' and 'quota' both suspend; they differ in what
                        -- the operator must DO - chase the grant, versus wait. Telling
                        -- an operator 「配额」 about an ungranted capability is simply false.
                        CHECK (failure_class IN ('transient', 'permanent', 'quota', 'unavailable')),
  failure_reason      TEXT,
  attempt             INTEGER NOT NULL DEFAULT 1,
  created_in_product  VARCHAR(32),                     -- [ref] row-level provenance (#108)
  created_by          VARCHAR(128),                    -- [ref] OBO user, when there is one
  queued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at          TIMESTAMPTZ,
  finished_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_processing_task_document FOREIGN KEY (document_id)
    REFERENCES karda_kb.document (id) ON DELETE CASCADE,
  CONSTRAINT fk_processing_task_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE
);
-- CONCURRENCY, not reporting: without this a duplicate enqueue puts two
-- pipelines on the same document, and 110-processing's atomic chunk replace
-- assumes a single writer.
-- Keyed on (document_id, KIND): the rule is per-pipeline. An extraction run
-- writes assertions and never touches chunks, so it does not contend with
-- processing; keyed on document_id alone this would have made an extraction task
-- and a reprocess of the same document mutually exclusive.
-- 这两条引用 processing_task.kind(incr/0008 才补的列)。processing_task 本身由
-- incr/0004 建,所以存在一个真实的中间态:库停在 0004..0007 之间时表在、列不在
-- ——本机 dev 库此刻正是这个状态。守卫让 baseline 在那种库上安静跳过,由 0008 补。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'karda_kb' AND table_name = 'processing_task' AND column_name = 'kind'
  ) THEN
      CREATE UNIQUE INDEX IF NOT EXISTS uidx_processing_task_doc_live
      ON karda_kb.processing_task (document_id, kind)
      WHERE state IN ('queued', 'running');
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_processing_task_kb_state
  ON karda_kb.processing_task (kb_id, state);
CREATE INDEX IF NOT EXISTS idx_processing_task_state_queued
  ON karda_kb.processing_task (state, queued_at);
CREATE INDEX IF NOT EXISTS idx_processing_task_kb_finished
  ON karda_kb.processing_task (kb_id, finished_at);

-- One row per (task, stage). A retry is a NEW task (attempt + 1), never an
-- overwrite here - overwriting would erase the previous timing, and stage P95 is
-- exactly the history. duration is NOT stored: it is ended_at - started_at.
-- 同上 —— 另一条依赖 kind 的独立索引。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'karda_kb' AND table_name = 'processing_task' AND column_name = 'kind'
  ) THEN
      CREATE INDEX IF NOT EXISTS idx_processing_task_kind_document
      ON karda_kb.processing_task (kind, document_id, state);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS karda_kb.processing_task_stage (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL,
  stage       VARCHAR(32) NOT NULL
                CONSTRAINT chk_processing_task_stage_stage
                CHECK (stage IN ('fetch', 'parse', 'chunk', 'embed', 'commit')),
  -- ai_assisted is the steward-extraction flavour (the purple dot): an OUTCOME
  -- of a stage, not a sixth stage.
  outcome     VARCHAR(32)
                CONSTRAINT chk_processing_task_stage_outcome
                CHECK (outcome IN ('ok', 'failed', 'skipped', 'ai_assisted')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_processing_task_stage_task FOREIGN KEY (task_id)
    REFERENCES karda_kb.processing_task (id) ON DELETE CASCADE,
  CONSTRAINT uidx_processing_task_stage UNIQUE (task_id, stage)
);
CREATE INDEX IF NOT EXISTS idx_processing_task_stage_p95
  ON karda_kb.processing_task_stage (stage, ended_at);

-- The supply ledger: one row per served call, append-only. Deliberately NOT in
-- local_usage - that schema is the C3 platform-metering contract buffer (factory
-- baseline, 210 section 1: not touched, not mirrored, not extended). Same shape,
-- different purpose: this one is ours to slice by consumer / capability / asset,
-- and the platform does not care about it. See 240 section 2.
CREATE TABLE IF NOT EXISTS karda_kb.supply_call (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel        VARCHAR(32) NOT NULL
                   CONSTRAINT chk_supply_call_channel
                   CHECK (channel IN ('direct', 'runos')),
  capability     VARCHAR(64) NOT NULL,             -- karda.kb-read / karda.kb-write
  operation      VARCHAR(64) NOT NULL,             -- search / ask / write_document / ...
  consumer_code  VARCHAR(64),                      -- calling agent; null for a human in Console
  workspace_id   UUID NOT NULL,                    -- [ref] the served workspace
  -- The taskId sent on to Atlas (karda#101), so one agent task's karda-side and
  -- Atlas-side consumption can be added back together. NOT named task_id: that
  -- name already means processing_task in this schema, and same-name-different-
  -- meaning is the hardest kind of mistake to find.
  task_id_ref    VARCHAR(128),
  outcome        VARCHAR(32) NOT NULL DEFAULT 'ok'
                   CONSTRAINT chk_supply_call_outcome
                   CHECK (outcome IN ('ok', 'degraded', 'error')),
  error_code     VARCHAR(64),
  latency_ms     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_supply_call_created
  ON karda_kb.supply_call (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_call_channel_created
  ON karda_kb.supply_call (channel, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_supply_call_consumer_created
  ON karda_kb.supply_call (consumer_code, created_at DESC);

-- Per-asset attribution for one call. A search recalls across several libraries,
-- so a single kb_id on supply_call would either miss rows or credit an arbitrary
-- one. Counts CITED, not recalled - heat is "was it believed", and counting
-- recalls would make a library nobody ever trusted look busy. A library with
-- cited_count = 0 gets NO row.
CREATE TABLE IF NOT EXISTS karda_kb.supply_call_asset (
  call_id      UUID NOT NULL,
  kb_id        UUID NOT NULL,
  cited_count  INTEGER NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_supply_call_asset PRIMARY KEY (call_id, kb_id),
  CONSTRAINT fk_supply_call_asset_call FOREIGN KEY (call_id)
    REFERENCES karda_kb.supply_call (id) ON DELETE CASCADE,
  CONSTRAINT fk_supply_call_asset_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_supply_call_asset_kb
  ON karda_kb.supply_call_asset (kb_id);

-- --- evaluation runner (240-ops-read-models section 8, built in batch 14) -----
--
-- Section 8 designed these four and deliberately did NOT build them: "四张空表
-- 进了基线" for a runner that did not exist is speculative schema. The runner
-- exists now, so the shape from that section lands verbatim.
--
-- Why quality needs its own tables at all: recall hit rate, citation precision
-- and grounded-answer rate were demo figures, so nothing could answer whether a
-- chunking change, a model swap or a template edit made retrieval better or
-- worse. A number nobody can reproduce is not a baseline.

-- An authored question set. KD-011 ruled out synthetic QA generation for v1, so
-- =============================================================================
-- Assertion layer (140-assertion-model, batch 15)
-- =============================================================================
--
-- v1's object model is a CARRIER model: it answers where content lives, how it
-- is split and how it is recalled, but not what it SAYS. KD-017 raised the
-- positioning to shared knowledge infrastructure for agents and ruled that
-- "Chunk is an intermediate product, not the core model". These five tables are
-- that ruling in schema. Live databases adopt them via incr/0006.

-- --- assertion ----------------------------------------------------------------
--
-- The five kinds from the blueprint (fact / claim / event / procedure / rule)
-- are an ENUM on one table, not five tables: their field needs are identical
-- (subject, statement, validity window, source, confidence) and the difference
-- is semantic. Five tables would mean five copies of the provenance and
-- governance logic on day one.
--
-- THE ONE COLUMN PAIR TO READ CAREFULLY: `asserted_by` and `extracted_by` are
-- not the same thing and must never be merged.
--   asserted_by   WHO SAID IT - the authority inside the source (the body that
--                 issued 《作业手册 2026》). This is what a citing agent needs.
--   extracted_by  WHO PULLED IT OUT - the model or steward run. This is process
--                 accountability.
-- Collapsing them makes the product tell an agent "karda said this", which
-- silently substitutes our authority for the source's.
--
-- There is deliberately NO `source_verified` column. KD-209 ruled the source
-- document's verification state is a SIGNAL that may be consulted, not a STATE
-- that is inherited - and a copied signal is a snapshot that goes stale. Read it
-- through evidence -> span -> document at query time, where it is always true.
CREATE TABLE IF NOT EXISTS karda_kb.assertion (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id              UUID NOT NULL,
  kind               VARCHAR(32) NOT NULL
                       CONSTRAINT chk_assertion_kind
                       CHECK (kind IN ('fact', 'claim', 'event', 'procedure', 'rule')),
  -- What the assertion is ABOUT. Used to cluster conflict candidates: two
  -- assertions can only contradict if they are about the same subject.
  subject            VARCHAR(512),
  statement          TEXT NOT NULL,
  asserted_by        VARCHAR(512),
  as_of              TIMESTAMPTZ,
  -- NULL = the source declared no expiry, NOT "never expires". The distinction
  -- matters for governance: an undeclared window is unknown, not infinite.
  valid_until        TIMESTAMPTZ,
  extracted_by       VARCHAR(128),
  extraction_run     UUID,
  -- Machine confidence at extraction. NULL for an authored assertion, which has
  -- no such thing. KD-210: it ranks an assertion only until a person confirms
  -- it; after that `verification_state` is the stronger signal and confidence
  -- stops scoring - but is never cleared, because it is the record of how the
  -- extractor performed.
  confidence         NUMERIC(4,3)
                       CONSTRAINT chk_assertion_confidence
                       CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  content_state      VARCHAR(32) NOT NULL DEFAULT 'draft'
                       CONSTRAINT chk_assertion_content_state
                       CHECK (content_state IN ('draft', 'processing', 'indexed', 'failed', 'archived', 'deleted')),
  failure_reason     TEXT,
  failed_at          TIMESTAMPTZ,
  verification_state VARCHAR(32) NOT NULL DEFAULT 'unverified'
                       CONSTRAINT chk_assertion_verification_state
                       CHECK (verification_state IN ('unverified', 'verified', 'stale')),
  verifier           VARCHAR(128),
  verified_at        TIMESTAMPTZ,
  expires_at         TIMESTAMPTZ,
  -- Set when a conflict is adjudicated: this assertion lost, and the winner is
  -- named. The loser is KEPT - "which one did we believe, and what did we
  -- replace" is exactly the question a superseded row exists to answer.
  superseded_by      UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_assertion_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE,
  -- The ops read model may be pruned; losing the task must not lose the
  -- assertion, so this detaches rather than cascades.
  CONSTRAINT fk_assertion_extraction_run FOREIGN KEY (extraction_run)
    REFERENCES karda_kb.processing_task (id) ON DELETE SET NULL,
  CONSTRAINT fk_assertion_superseded_by FOREIGN KEY (superseded_by)
    REFERENCES karda_kb.assertion (id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_assertion_kb_content
  ON karda_kb.assertion (kb_id, content_state);
-- The steward queue reads this one: everything awaiting a person, per library.
CREATE INDEX IF NOT EXISTS idx_assertion_kb_verification
  ON karda_kb.assertion (kb_id, verification_state);
-- Conflict candidates are found by subject, not by embedding distance.
CREATE INDEX IF NOT EXISTS idx_assertion_kb_subject
  ON karda_kb.assertion (kb_id, subject);

-- --- span ---------------------------------------------------------------------
--
-- A byte range in ONE VERSION of a document. `document_version` is the third of
-- yucer's three questions ("哪一版") and is why this is not just a chunk
-- reference: a chunk is reborn on every rebuild, a span is anchored to the
-- version it was read from.
--
-- `excerpt` is stored redundantly on purpose. After a rebuild the offsets may
-- no longer resolve against the current text, and a citation that cannot show
-- what it quoted is not a citation.
--
-- A span is a MEASUREMENT and is never updated (see the column locks below).
CREATE TABLE IF NOT EXISTS karda_kb.span (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id      UUID NOT NULL,
  document_version INTEGER NOT NULL,
  start_offset     INTEGER NOT NULL,
  end_offset       INTEGER NOT NULL,
  excerpt          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_span_range CHECK (end_offset > start_offset AND start_offset >= 0),
  CONSTRAINT fk_span_document FOREIGN KEY (document_id)
    REFERENCES karda_kb.document (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_span_document_version
  ON karda_kb.span (document_id, document_version);

-- --- evidence -----------------------------------------------------------------
--
-- An EDGE, not a column on `assertion`. One assertion can rest on several
-- grounds, one span can support several assertions, and grounds can themselves
-- be assertions (a derivation chain). A column would break the first time two
-- documents both supported the same statement.
--
-- `stance = 'contradicts'` is where conflict detection lands: two assertions
-- that each have supporting evidence AND contradict each other are the input to
-- a steward proposal.
CREATE TABLE IF NOT EXISTS karda_kb.evidence (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assertion_id UUID NOT NULL,
  span_id      UUID,
  supports_id  UUID,
  stance       VARCHAR(16) NOT NULL DEFAULT 'supports'
                 CONSTRAINT chk_evidence_stance
                 CHECK (stance IN ('supports', 'contradicts')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one ground. An edge with neither end is not evidence; an edge with
  -- both is two claims wearing one row.
  CONSTRAINT chk_evidence_one_ground
    CHECK ((span_id IS NOT NULL) <> (supports_id IS NOT NULL)),
  CONSTRAINT fk_evidence_assertion FOREIGN KEY (assertion_id)
    REFERENCES karda_kb.assertion (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_span FOREIGN KEY (span_id)
    REFERENCES karda_kb.span (id) ON DELETE CASCADE,
  CONSTRAINT fk_evidence_supports FOREIGN KEY (supports_id)
    REFERENCES karda_kb.assertion (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_evidence_assertion
  ON karda_kb.evidence (assertion_id);
CREATE INDEX IF NOT EXISTS idx_evidence_span
  ON karda_kb.evidence (span_id);

-- --- entity -------------------------------------------------------------------
--
-- The library's registry of business objects. Scoped to ONE library on purpose:
-- cross-library entity resolution is an ontology problem and belongs to the
-- Ontos plane (Atlas thinks, Runos acts, Karda knows, Arda holds data, Ontos
-- holds semantics). Writing that boundary down now is what stops this table
-- growing into a half-built ontology.
CREATE TABLE IF NOT EXISTS karda_kb.entity (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id      UUID NOT NULL,
  name       VARCHAR(512) NOT NULL,
  kind       VARCHAR(64) NOT NULL DEFAULT 'thing',
  aliases    JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_entity_kb FOREIGN KEY (kb_id)
    REFERENCES karda_kb.knowledge_base (id) ON DELETE CASCADE
);
-- Entity identity is its stable id. Names are not unique after 0044.

-- --- assertion_mention --------------------------------------------------------
--
-- Which entities an assertion names, and in what role. A composite key rather
-- than a surrogate id: the same assertion naming the same entity in the same
-- role twice is a duplicate, and the key says so.
CREATE TABLE IF NOT EXISTS karda_kb.assertion_mention (
  assertion_id UUID NOT NULL,
  entity_id    UUID NOT NULL,
  role         VARCHAR(32) NOT NULL DEFAULT 'mentions',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assertion_id, entity_id, role),
  CONSTRAINT fk_mention_assertion FOREIGN KEY (assertion_id)
    REFERENCES karda_kb.assertion (id) ON DELETE CASCADE,
  CONSTRAINT fk_mention_entity FOREIGN KEY (entity_id)
    REFERENCES karda_kb.entity (id) ON DELETE CASCADE
);
-- `find_entity` walks this direction: entity -> the assertions that name it.
CREATE INDEX IF NOT EXISTS idx_mention_entity
  ON karda_kb.assertion_mention (entity_id);

-- every question here is written by a person.
CREATE TABLE IF NOT EXISTS karda_kb.eval_set (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID NOT NULL,                     -- [ref] owning workspace
  name          VARCHAR(255) NOT NULL,
  description   TEXT,
  -- The libraries a run evaluates over, as a JSONB array of kb ids. NOT a join
  -- table: the scope is a property of the set, not an entity, and section 8
  -- specifies four tables. A kb id that no longer exists simply drops out of the
  -- scope at run time - the set stays valid and says so in its result.
  kb_scope      JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by    VARCHAR(128),                      -- [ref] the author
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uidx_eval_set_ws_name UNIQUE (workspace_id, name)
);
CREATE INDEX IF NOT EXISTS idx_eval_set_ws
  ON karda_kb.eval_set (workspace_id, created_at DESC);

-- One question, with the evidence a correct answer must rest on.
CREATE TABLE IF NOT EXISTS karda_kb.eval_question (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id        UUID NOT NULL,
  question      TEXT NOT NULL,
  -- Expected evidence as DOCUMENT / ENTRY ids, never chunk ids. A chunk id is
  -- reborn on every rebuild (110-processing's atomic replace bumps the version
  -- and mints new ids), so a set pinned to chunks would break on exactly the
  -- change it exists to measure. Recall returns chunk ids; the runner maps them
  -- back to their document before comparing.
  expected_evidence JSONB NOT NULL DEFAULT '[]'::jsonb,
  note          TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_eval_question_set FOREIGN KEY (set_id)
    REFERENCES karda_kb.eval_set (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eval_question_set
  ON karda_kb.eval_question (set_id, position);

-- One run of one set against one baseline. The BASELINE LABEL is what makes a
-- run comparable: "did this change help" is only answerable between two runs
-- that name what they ran against.
CREATE TABLE IF NOT EXISTS karda_kb.eval_run (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id              UUID NOT NULL,
  workspace_id        UUID NOT NULL,               -- [ref] denormalised for scoping
  baseline_label      VARCHAR(128) NOT NULL,       -- e.g. bge-m3@v2 / rerank-off
  verification_filter VARCHAR(32) NOT NULL,        -- the quality tier the run asked for
  top_k               INTEGER NOT NULL,
  state               VARCHAR(32) NOT NULL DEFAULT 'running'
                        CONSTRAINT chk_eval_run_state
                        CHECK (state IN ('running', 'completed', 'failed')),
  -- Aggregates, written once at completion. Stored rather than recomputed so a
  -- run stays a durable, comparable record even after its set is edited - a
  -- before/after that silently re-derives from today's questions is not a
  -- before/after.
  question_count      INTEGER NOT NULL DEFAULT 0,
  recall_hit_pct      NUMERIC(5,2),
  citation_precision_pct NUMERIC(5,2),
  grounded_answer_pct NUMERIC(5,2),
  gap_count           INTEGER NOT NULL DEFAULT 0,
  -- Honest disclosure, carried per run: a run whose rerank was unavailable
  -- measured a different chain than one whose was, and comparing them as equals
  -- is how a phantom regression gets reported.
  degraded            BOOLEAN NOT NULL DEFAULT false,
  error_code          VARCHAR(64),
  created_by          VARCHAR(128),                -- [ref] who ran it
  started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at         TIMESTAMPTZ,
  CONSTRAINT fk_eval_run_set FOREIGN KEY (set_id)
    REFERENCES karda_kb.eval_set (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eval_run_set_started
  ON karda_kb.eval_run (set_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_run_ws_started
  ON karda_kb.eval_run (workspace_id, started_at DESC);

-- Per-question outcome. This is where a GAP is a first-class fact rather than a
-- subtraction: a question whose expected evidence never surfaced is the one row
-- an operator has to look at, and it names which question.
CREATE TABLE IF NOT EXISTS karda_kb.eval_run_result (
  run_id         UUID NOT NULL,
  question_id    UUID NOT NULL,
  -- Did any expected document appear in the recalled set? The recall half.
  recall_hit     BOOLEAN NOT NULL,
  -- Of the citations the answer actually used, how many were expected. The
  -- precision half; both counts are kept so the ratio can be re-derived and
  -- audited rather than trusted.
  cited_expected INTEGER NOT NULL DEFAULT 0,
  cited_total    INTEGER NOT NULL DEFAULT 0,
  -- Did the run produce an answer resting on at least one citation? An
  -- ungrounded answer is a failure even when it reads well - that is the whole
  -- premise of a cited-answer product.
  grounded       BOOLEAN NOT NULL DEFAULT false,
  answer_excerpt TEXT,
  latency_ms     INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT pk_eval_run_result PRIMARY KEY (run_id, question_id),
  CONSTRAINT fk_eval_run_result_run FOREIGN KEY (run_id)
    REFERENCES karda_kb.eval_run (id) ON DELETE CASCADE,
  CONSTRAINT fk_eval_run_result_question FOREIGN KEY (question_id)
    REFERENCES karda_kb.eval_question (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_eval_run_result_run
  ON karda_kb.eval_run_result (run_id);

-- Same-transaction invalidation outbox. Apply through db-init only.
CREATE TABLE IF NOT EXISTS vx_provision.access_revision (
  workspace_id UUID PRIMARY KEY,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  published_generation BIGINT NOT NULL DEFAULT 0 CHECK (published_generation >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Durable byte reservations. Structure changes run through reviewed db-init only.
CREATE TABLE IF NOT EXISTS karda_kb.storage_watermark (
  workspace_id UUID PRIMARY KEY,
  value BIGINT NOT NULL CHECK (value >= 0),
  observed_at TIMESTAMPTZ NOT NULL,
  pending BOOLEAN NOT NULL DEFAULT true,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  retry_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS karda_kb.stored_object (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  kb_id UUID NOT NULL,
  content_hash VARCHAR(64) NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  size_bytes BIGINT NOT NULL CHECK (size_bytes >= 0),
  state VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','ready','deleting','deleted')),
  retain_until TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  retry_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stored_object_workspace ON karda_kb.stored_object(workspace_id, state);
CREATE INDEX IF NOT EXISTS idx_stored_object_recovery ON karda_kb.stored_object(retry_at, retain_until);


CREATE TABLE IF NOT EXISTS local_authz.owner_anchor (
  workspace_id UUID PRIMARY KEY,
  member_id UUID NOT NULL UNIQUE REFERENCES local_authz.member(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS local_authz.role_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  actor_sub VARCHAR(128) NOT NULL,
  target_sub VARCHAR(128) NOT NULL,
  action VARCHAR(64) NOT NULL,
  roles_before JSONB NOT NULL,
  roles_after JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Catalogs are product-owned; runtime may assign roles, not rewrite policy.
INSERT INTO local_authz.role(role_code,name) VALUES ('owner','owner') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('administrator','administrator') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('member','member') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('readonly','readonly') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.role(role_code,name) VALUES ('guest','guest') ON CONFLICT (role_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('product.enter','product.enter') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('data.read','data.read') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('data.write','data.write') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('data.export','data.export') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('ai.use','ai.use') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('service.publish','service.publish') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('members.manage','members.manage') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('product.manage','product.manage') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('ownership.transfer','ownership.transfer') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.permission(perm_code,name) VALUES ('guest.read','guest.read') ON CONFLICT (perm_code) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='data.write' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='data.export' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='ai.use' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='service.publish' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='members.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='product.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='ownership.transfer' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='owner' AND p.perm_code='guest.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='data.write' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='data.export' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='ai.use' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='service.publish' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='members.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='product.manage' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='administrator' AND p.perm_code='guest.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='data.write' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='data.export' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='ai.use' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='member' AND p.perm_code='service.publish' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='readonly' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='readonly' AND p.perm_code='data.read' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='guest' AND p.perm_code='product.enter' ON CONFLICT (role_id,permission_id) DO NOTHING;
INSERT INTO local_authz.role_permission(role_id,permission_id) SELECT r.id,p.id FROM local_authz.role r CROSS JOIN local_authz.permission p WHERE r.role_code='guest' AND p.perm_code='guest.read' ON CONFLICT (role_id,permission_id) DO NOTHING;

-- BEGIN SEMANTIC FOUNDATION
CREATE UNIQUE INDEX IF NOT EXISTS uidx_entity_semantic_scope ON karda_kb.entity(kb_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_assertion_semantic_scope ON karda_kb.assertion(kb_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS uidx_document_semantic_scope ON karda_kb.document(kb_id,id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_schema_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
  namespace VARCHAR(128) NOT NULL,
  schema_id VARCHAR(128) NOT NULL,
  version VARCHAR(128) NOT NULL,
  definition_hash VARCHAR(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,namespace,schema_id,version), UNIQUE(kb_id,id)
);

-- Append-only decisions outlive compilation/rebuild. No inferred human identity.
CREATE TABLE IF NOT EXISTS karda_kb.semantic_review (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
  subject_key VARCHAR(256) NOT NULL,
  revision INTEGER NOT NULL CHECK (revision>0),
  decision VARCHAR(16) NOT NULL CHECK (decision IN ('accept','revise','reject')),
  subject_hash VARCHAR(64) NOT NULL CHECK (subject_hash ~ '^[a-f0-9]{64}$'),
  reviewer_sub VARCHAR(128) NOT NULL CHECK (length(btrim(reviewer_sub))>0),
  note TEXT NOT NULL CHECK (length(btrim(note))>0 AND length(note)<=10000),
  correction JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(correction)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,subject_key,revision), UNIQUE(kb_id,id)
);

-- Completed compilation snapshots; in-flight scheduling belongs to task runs.
CREATE TABLE IF NOT EXISTS karda_kb.semantic_compile_run (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL,
  schema_version_id UUID NOT NULL,
  task_key VARCHAR(64) NOT NULL CHECK (task_key ~ '^[a-f0-9]{64}$'),
  input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  config_hash VARCHAR(64) NOT NULL CHECK (config_hash ~ '^[a-f0-9]{64}$'),
  source_manifest JSONB NOT NULL CHECK (jsonb_typeof(source_manifest)='array'),
  candidates JSONB NOT NULL CHECK (jsonb_typeof(candidates)='object'),
  status VARCHAR(16) NOT NULL CHECK (status IN ('validated','rejected','failed')),
  error_code VARCHAR(128),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,task_key), UNIQUE(kb_id,id,schema_version_id),
  FOREIGN KEY(kb_id,schema_version_id) REFERENCES karda_kb.semantic_schema_version(kb_id,id)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kb_id UUID NOT NULL,
  generation INTEGER NOT NULL CHECK (generation>0),
  schema_version_id UUID NOT NULL,
  compile_run_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,generation), UNIQUE(kb_id,id), UNIQUE(kb_id,id,generation),
  FOREIGN KEY(kb_id,compile_run_id,schema_version_id)
    REFERENCES karda_kb.semantic_compile_run(kb_id,id,schema_version_id)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release_head (
  kb_id UUID PRIMARY KEY REFERENCES karda_kb.knowledge_base(id),
  generation INTEGER NOT NULL CHECK (generation>0),
  release_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY(kb_id,release_id,generation) REFERENCES karda_kb.semantic_release(kb_id,id,generation)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_relation (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  relation_id UUID NOT NULL,
  type VARCHAR(128) NOT NULL,
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  origin VARCHAR(16) NOT NULL DEFAULT 'asserted' CHECK (origin='asserted'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,relation_id),
  FOREIGN KEY(kb_id,release_id) REFERENCES karda_kb.semantic_release(kb_id,id),
  FOREIGN KEY(kb_id,source_id) REFERENCES karda_kb.entity(kb_id,id),
  FOREIGN KEY(kb_id,target_id) REFERENCES karda_kb.entity(kb_id,id)
);
CREATE INDEX IF NOT EXISTS idx_semantic_relation_source ON karda_kb.semantic_relation(kb_id,release_id,source_id);
CREATE INDEX IF NOT EXISTS idx_semantic_relation_target ON karda_kb.semantic_relation(kb_id,release_id,target_id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_relation_assertion (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  relation_id UUID NOT NULL,
  assertion_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,relation_id,assertion_id),
  FOREIGN KEY(kb_id,release_id,relation_id) REFERENCES karda_kb.semantic_relation(kb_id,release_id,relation_id),
  FOREIGN KEY(kb_id,assertion_id) REFERENCES karda_kb.assertion(kb_id,id)
);
CREATE INDEX IF NOT EXISTS idx_semantic_assertion_impact ON karda_kb.semantic_relation_assertion(kb_id,assertion_id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release_source (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  document_id UUID NOT NULL,
  document_version INTEGER NOT NULL CHECK (document_version>0),
  content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,document_id),
  FOREIGN KEY(kb_id,release_id) REFERENCES karda_kb.semantic_release(kb_id,id),
  FOREIGN KEY(kb_id,document_id) REFERENCES karda_kb.document(kb_id,id)
);
CREATE INDEX IF NOT EXISTS idx_semantic_source_impact ON karda_kb.semantic_release_source(kb_id,document_id);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_release_review (
  kb_id UUID NOT NULL,
  release_id UUID NOT NULL,
  review_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,release_id,review_id),
  FOREIGN KEY(kb_id,release_id) REFERENCES karda_kb.semantic_release(kb_id,id),
  FOREIGN KEY(kb_id,review_id) REFERENCES karda_kb.semantic_review(kb_id,id)
);

CREATE TABLE IF NOT EXISTS karda_kb.semantic_event_receipt (
  kb_id UUID NOT NULL,
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  release_id UUID NOT NULL,
  generation INTEGER NOT NULL CHECK (generation>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,event_id),
  FOREIGN KEY(kb_id,release_id,generation) REFERENCES karda_kb.semantic_release(kb_id,id,generation)
);
-- END SEMANTIC FOUNDATION

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

-- BEGIN DOCUMENT TEXT SNAPSHOT
CREATE TABLE IF NOT EXISTS karda_kb.document_text_snapshot (
  document_id UUID NOT NULL REFERENCES karda_kb.document(id) ON DELETE CASCADE,
  document_version INTEGER NOT NULL CHECK (document_version>0),
  content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  mime VARCHAR(128) NOT NULL,
  parser_version VARCHAR(64) NOT NULL,
  canonical_text TEXT NOT NULL CHECK (char_length(canonical_text) BETWEEN 1 AND 5000000),
  text_hash VARCHAR(64) NOT NULL CHECK (text_hash ~ '^[a-f0-9]{64}$'),
  locators JSONB NOT NULL CHECK (jsonb_typeof(locators)='array' AND jsonb_array_length(locators) BETWEEN 1 AND 20000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(document_id,document_version),
  CONSTRAINT document_text_snapshot_parser_check CHECK (
    (mime='application/pdf' AND parser_version IN ('pypdf-6.21.4-v1','atlas-ocr-v1')) OR
    (mime='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      AND parser_version IN ('docx-main-body-v1','docx-body-tables-v2','docx-referenced-stories-v3','docx-cell-grid-v4','docx-numbered-stories-v5')) OR
    (mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' AND parser_version IN ('xlsx-literal-cells-v1','xlsx-cell-ranges-v2')) OR
    (mime='application/vnd.openxmlformats-officedocument.presentationml.presentation' AND parser_version IN ('pptx-slide-text-v1','pptx-cell-grid-v2','pptx-authored-stories-v3')))
);
-- END DOCUMENT TEXT SNAPSHOT

-- BEGIN TOPIC DOSSIER
CREATE TABLE IF NOT EXISTS karda_kb.topic_dossier (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
  relation_type VARCHAR(128) NOT NULL CHECK (length(btrim(relation_type))>0),
  input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  payload_hash VARCHAR(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  created_by VARCHAR(128) NOT NULL CHECK (length(btrim(created_by))>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,id),
  UNIQUE(kb_id,relation_type,input_hash)
);
-- END TOPIC DOSSIER

-- BEGIN TOPIC SUMMARY
CREATE TABLE IF NOT EXISTS karda_kb.topic_summary (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL,
  dossier_id UUID NOT NULL,
  input_hash VARCHAR(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  payload_hash VARCHAR(64) NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload)='object'),
  selection JSONB NOT NULL CHECK (jsonb_typeof(selection)='object'),
  created_by VARCHAR(128) NOT NULL CHECK (length(btrim(created_by))>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,id),
  FOREIGN KEY(kb_id,dossier_id) REFERENCES karda_kb.topic_dossier(kb_id,id)
);
-- END TOPIC SUMMARY

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

-- BEGIN DOCUMENT OCR DRAFT
CREATE TABLE IF NOT EXISTS karda_kb.document_ocr_draft (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES karda_kb.document(id) ON DELETE CASCADE,
  content_hash VARCHAR(64) NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  base_version INTEGER NOT NULL CHECK (base_version>=0),
  model_code VARCHAR(128) NOT NULL CHECK (length(btrim(model_code))>0),
  created_by VARCHAR(128) NOT NULL CHECK (length(btrim(created_by))>0),
  state VARCHAR(16) NOT NULL CHECK (state IN ('running','ready','failed','rejected','committed')),
  payload JSONB,
  payload_hash VARCHAR(64) CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  error_code VARCHAR(64),
  committed_version INTEGER CHECK (committed_version>0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((payload IS NULL)=(payload_hash IS NULL)),
  CHECK (payload IS NULL OR jsonb_typeof(payload)='object'),
  CHECK (state NOT IN ('ready','committed') OR payload IS NOT NULL),
  CHECK ((state='committed')=(committed_version IS NOT NULL)),
  CHECK (committed_version IS NULL OR committed_version=base_version+1)
);
-- END DOCUMENT OCR DRAFT

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

-- BEGIN COMPILE PROFILES
CREATE TABLE IF NOT EXISTS karda_kb.compile_profile_version (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title))>0),
  schema_id VARCHAR(64) NOT NULL,
  schema_version VARCHAR(64) NOT NULL,
  definition_hash VARCHAR(64) NOT NULL CHECK (definition_hash ~ '^[a-f0-9]{64}$'),
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition)='object'),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kb_id,id),
  UNIQUE(kb_id,schema_id,schema_version)
);
CREATE TABLE IF NOT EXISTS karda_kb.compile_profile_activation (
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  profile_id UUID,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  note TEXT NOT NULL CHECK (length(btrim(note)) BETWEEN 1 AND 10000),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,revision),
  UNIQUE(kb_id,event_id),
  FOREIGN KEY(kb_id,profile_id) REFERENCES karda_kb.compile_profile_version(kb_id,id)
);
-- END COMPILE PROFILES

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

-- BEGIN INDEX REBUILD
CREATE TABLE IF NOT EXISTS karda_kb.index_rebuild (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  created_by VARCHAR(128) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  params JSONB NOT NULL CHECK (jsonb_typeof(params)='object'),
  embedding_model VARCHAR(128),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  state VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK (state IN ('planned','active','reverted','cancelled')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.index_rebuild_item (
  run_id UUID NOT NULL REFERENCES karda_kb.index_rebuild(id) ON DELETE CASCADE,
  document_id UUID NOT NULL,
  source_version INTEGER NOT NULL CHECK (source_version>0),
  content_hash VARCHAR(64) NOT NULL,
  text_hash VARCHAR(64) NOT NULL,
  baseline_hash VARCHAR(64) NOT NULL,
  baseline JSONB NOT NULL CHECK (jsonb_typeof(baseline)='array' AND jsonb_array_length(baseline) BETWEEN 1 AND 1000),
  state VARCHAR(16) NOT NULL DEFAULT 'planned' CHECK (state IN ('planned','running','ready','failed')),
  attempt INTEGER NOT NULL DEFAULT 0 CHECK (attempt BETWEEN 0 AND 3),
  lease_id UUID,
  lease_until TIMESTAMPTZ,
  candidate JSONB CHECK (jsonb_typeof(candidate)='array' AND jsonb_array_length(candidate) BETWEEN 1 AND 1000),
  candidate_hash VARCHAR(64),
  error_code VARCHAR(64),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,document_id),
  CHECK ((state='running')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)),
  CHECK ((lease_id IS NULL)=(lease_until IS NULL)),
  CHECK ((state='ready')=(candidate IS NOT NULL AND candidate_hash IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.index_rebuild_event (
  run_id UUID NOT NULL REFERENCES karda_kb.index_rebuild(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('activate','revert','cancel')),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,revision),
  UNIQUE(run_id,event_id)
);
-- END INDEX REBUILD

-- BEGIN PILOT WORKFLOW
CREATE TABLE IF NOT EXISTS karda_kb.pilot_case (
  id UUID PRIMARY KEY,
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  created_by VARCHAR(128) NOT NULL,
  title VARCHAR(200) NOT NULL CHECK (length(btrim(title))>0),
  query VARCHAR(500) NOT NULL CHECK (length(btrim(query))>0),
  top_k INTEGER NOT NULL CHECK (top_k BETWEEN 1 AND 20),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  request_hash VARCHAR(64) NOT NULL,
  state VARCHAR(16) NOT NULL DEFAULT 'open' CHECK (state IN ('open','reviewed','closed')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision>=0),
  verdict VARCHAR(24) CHECK (verdict IN ('prefer_source','prefer_published','equivalent','neither')),
  reviewed_observation UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((state='open' AND verdict IS NULL AND reviewed_observation IS NULL) OR (state<>'open' AND verdict IS NOT NULL AND reviewed_observation IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.pilot_observation (
  id UUID PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES karda_kb.pilot_case(id) ON DELETE CASCADE,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  summary JSONB NOT NULL CHECK (jsonb_typeof(summary)='object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(case_id,id)
);
CREATE TABLE IF NOT EXISTS karda_kb.pilot_event (
  case_id UUID NOT NULL REFERENCES karda_kb.pilot_case(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL,
  action VARCHAR(16) NOT NULL CHECK (action IN ('review','close','reopen')),
  observation_id UUID,
  verdict VARCHAR(24) CHECK (verdict IN ('prefer_source','prefer_published','equivalent','neither')),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(case_id,revision),
  UNIQUE(case_id,event_id),
  FOREIGN KEY(case_id,observation_id) REFERENCES karda_kb.pilot_observation(case_id,id),
  CHECK ((action='reopen' AND observation_id IS NULL AND verdict IS NULL) OR (action<>'reopen' AND observation_id IS NOT NULL AND verdict IS NOT NULL))
);
-- END PILOT WORKFLOW

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

-- BEGIN LIBRARY SHARING
CREATE TABLE IF NOT EXISTS karda_kb.library_sharing_event (
  kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL CHECK (revision>0),
  event_id UUID NOT NULL,
  fingerprint VARCHAR(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  before_state VARCHAR(32) NOT NULL CHECK (before_state IN ('private','ws_published','org_published')),
  after_state VARCHAR(32) NOT NULL CHECK (after_state IN ('private','ws_published','org_published')),
  impact JSONB NOT NULL CHECK (jsonb_typeof(impact)='object'),
  note TEXT NOT NULL CHECK (length(btrim(note))>0),
  created_by VARCHAR(128) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(kb_id,revision),
  UNIQUE(kb_id,event_id)
);
-- END LIBRARY SHARING

-- BEGIN SOURCE MANAGEMENT
CREATE TABLE IF NOT EXISTS karda_kb.source_control_event (
 binding_id UUID NOT NULL REFERENCES karda_kb.binding(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>0), event_id UUID NOT NULL, fingerprint VARCHAR(64) NOT NULL,
 action VARCHAR(32) NOT NULL, note TEXT NOT NULL, result JSONB NOT NULL, created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(binding_id,revision), UNIQUE(binding_id,event_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.source_sync_run (
 id UUID PRIMARY KEY, binding_id UUID NOT NULL REFERENCES karda_kb.binding(id) ON DELETE CASCADE,
 mode VARCHAR(16) NOT NULL CHECK(mode IN ('backfill','incremental')), request_hash VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','attention','done','cancelled')),
 note TEXT NOT NULL, created_by VARCHAR(128) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.source_sync_item (
 id UUID PRIMARY KEY, run_id UUID NOT NULL REFERENCES karda_kb.source_sync_run(id) ON DELETE CASCADE,
 source_doc_id VARCHAR(255) NOT NULL, source_version INTEGER NOT NULL CHECK(source_version>0),
 event VARCHAR(16) NOT NULL CHECK(event IN ('upsert','delete')), title VARCHAR(512) NOT NULL,
 payload JSONB NOT NULL, payload_hash VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','applied','failed','cancelled')),
 attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3), lease_id UUID, lease_until TIMESTAMPTZ,
 document_id UUID, outcome VARCHAR(32), error_code VARCHAR(64), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(run_id,source_doc_id), CHECK((state='running')=(lease_id IS NOT NULL AND lease_until IS NOT NULL)), CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.source_document_head (
 binding_id UUID NOT NULL REFERENCES karda_kb.binding(id) ON DELETE CASCADE, source_doc_id VARCHAR(255) NOT NULL,
 source_version INTEGER NOT NULL CHECK(source_version>0), event VARCHAR(16) NOT NULL CHECK(event IN ('upsert','delete')),
 content_hash VARCHAR(64), document_id UUID, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(binding_id,source_doc_id)
);
-- END SOURCE MANAGEMENT


-- BEGIN KNOWLEDGE SERVICES
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL, created_by VARCHAR(128) NOT NULL,
 draft JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','stopped')),
 active_version UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS knowledge_service_scope ON karda_kb.knowledge_service(workspace_id,id);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service_version (
 id UUID PRIMARY KEY, service_id UUID NOT NULL REFERENCES karda_kb.knowledge_service(id) ON DELETE CASCADE,
 config JSONB NOT NULL, config_hash VARCHAR(64) NOT NULL, created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(service_id,id)
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service_event (
 service_id UUID NOT NULL REFERENCES karda_kb.knowledge_service(id) ON DELETE CASCADE,
 revision INTEGER NOT NULL CHECK(revision>0), event_id UUID NOT NULL, fingerprint VARCHAR(64) NOT NULL,
 action VARCHAR(16) NOT NULL, note TEXT NOT NULL, result JSONB NOT NULL, created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY(service_id,revision), UNIQUE(service_id,event_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.knowledge_service_call (
 request_id UUID PRIMARY KEY, service_id UUID NOT NULL REFERENCES karda_kb.knowledge_service(id) ON DELETE CASCADE,
 version_id UUID, config_hash VARCHAR(64) NOT NULL, caller_sub VARCHAR(128) NOT NULL, caller_product VARCHAR(32) NOT NULL,
 capability VARCHAR(16) NOT NULL CHECK(capability IN ('facts','topics','source','package','context')), draft BOOLEAN NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'running' CHECK(state IN ('running','succeeded','failed')),
 status INTEGER, error_code VARCHAR(80), latency_ms INTEGER, output_bytes INTEGER,
 steps JSONB NOT NULL DEFAULT '[]', usage JSONB NOT NULL DEFAULT '[]', context_metadata JSONB, started_at TIMESTAMPTZ NOT NULL DEFAULT now(), finished_at TIMESTAMPTZ,
 CHECK((state='running')=(finished_at IS NULL))
);
CREATE INDEX IF NOT EXISTS knowledge_service_call_page ON karda_kb.knowledge_service_call(service_id,request_id);
-- END KNOWLEDGE SERVICES


-- BEGIN PRODUCTION CENTER
CREATE TABLE IF NOT EXISTS karda_kb.production_plan (
 id UUID PRIMARY KEY,workspace_id UUID NOT NULL,created_by VARCHAR(128) NOT NULL,title VARCHAR(200) NOT NULL,
 extract_missing BOOLEAN NOT NULL,request_hash VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','paused','cancelled')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.production_unit (
 id UUID PRIMARY KEY,plan_id UUID NOT NULL REFERENCES karda_kb.production_plan(id) ON DELETE CASCADE,
 kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id) ON DELETE CASCADE,manifest JSONB NOT NULL,config_hash VARCHAR(64) NOT NULL,
 compile_task_id UUID NOT NULL,UNIQUE(plan_id,kb_id)
);
CREATE TABLE IF NOT EXISTS karda_kb.production_step (
 id UUID PRIMARY KEY,unit_id UUID NOT NULL REFERENCES karda_kb.production_unit(id) ON DELETE CASCADE,
 kind VARCHAR(16) NOT NULL CHECK(kind IN ('process','extract','compile','publish')),document_id UUID,payload JSONB NOT NULL DEFAULT '{}',
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','waiting','review','done','failed','cancelled')),
 attempt INTEGER NOT NULL DEFAULT 0 CHECK(attempt BETWEEN 0 AND 3),lease_id UUID,lease_until TIMESTAMPTZ,
 receipt JSONB NOT NULL DEFAULT '{}',error_code VARCHAR(80),updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((state='running')=(lease_id IS NOT NULL AND lease_until IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS karda_kb.production_event (
 plan_id UUID NOT NULL REFERENCES karda_kb.production_plan(id) ON DELETE CASCADE,revision INTEGER NOT NULL,event_id UUID NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,result JSONB NOT NULL,
 created_by VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(plan_id,revision),UNIQUE(plan_id,event_id)
);
-- END PRODUCTION CENTER


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

-- BEGIN GRAPH CENTERS
CREATE TABLE IF NOT EXISTS karda_kb.graph_index (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL, created_by VARCHAR(128) NOT NULL,
 product_code VARCHAR(32) NOT NULL DEFAULT 'karda',
 kb_ids JSONB NOT NULL CHECK(jsonb_typeof(kb_ids)='array'), scope_key VARCHAR(64) NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','building','ready','failed','cancelled','stale')),
 revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0), attempt INTEGER NOT NULL DEFAULT 0,
 lease_id UUID, lease_until TIMESTAMPTZ, target_hash VARCHAR(64), active_hash VARCHAR(64),
 node_count INTEGER NOT NULL DEFAULT 0, edge_count INTEGER NOT NULL DEFAULT 0,
 manifest JSONB NOT NULL DEFAULT '{}', error_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,created_by,scope_key)
);
CREATE TABLE IF NOT EXISTS karda_kb.graph_asset (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL, kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),
 created_by VARCHAR(128) NOT NULL, kind VARCHAR(16) NOT NULL CHECK(kind IN ('view','topic','rules')),
 title VARCHAR(200) NOT NULL, visibility VARCHAR(16) NOT NULL DEFAULT 'personal' CHECK(visibility IN ('personal','workspace')),
 draft JSONB NOT NULL, revision INTEGER NOT NULL DEFAULT 1 CHECK(revision>0),
 state VARCHAR(16) NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','stopped','deleted')),
 active_version UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.graph_asset_version (
 id UUID PRIMARY KEY, asset_id UUID NOT NULL REFERENCES karda_kb.graph_asset(id),
 config JSONB NOT NULL, config_hash VARCHAR(64) NOT NULL, created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(asset_id,id)
);
CREATE TABLE IF NOT EXISTS karda_kb.graph_control (
 id UUID PRIMARY KEY, workspace_id UUID NOT NULL, target_id UUID NOT NULL,
 revision INTEGER NOT NULL CHECK(revision>0), request_id UUID NOT NULL, fingerprint VARCHAR(64) NOT NULL,
 action VARCHAR(32) NOT NULL, note TEXT NOT NULL, result JSONB NOT NULL,
 created_by VARCHAR(128) NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(target_id,revision), UNIQUE(target_id,request_id)
);
-- END GRAPH CENTERS

-- BEGIN ENTITY CONSISTENCY
CREATE TABLE IF NOT EXISTS karda_kb.identity_head (
 kb_id UUID PRIMARY KEY REFERENCES karda_kb.knowledge_base(id),workspace_id UUID NOT NULL,
 draft JSONB NOT NULL,revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),active_version UUID,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.identity_version (
 id UUID PRIMARY KEY,kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),config JSONB NOT NULL,
 config_hash VARCHAR(64) NOT NULL,created_by VARCHAR(128) NOT NULL,note TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(kb_id,id)
);
CREATE TABLE IF NOT EXISTS karda_kb.identity_control (
 kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),revision INTEGER NOT NULL CHECK(revision>0),
 request_id UUID NOT NULL,fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,
 result JSONB NOT NULL,created_by VARCHAR(128) NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(kb_id,revision),UNIQUE(kb_id,request_id)
);
-- END ENTITY CONSISTENCY

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

-- BEGIN AUTOMATIC CONNECTORS
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector (
 id UUID PRIMARY KEY,kb_id UUID NOT NULL REFERENCES karda_kb.knowledge_base(id),workspace_id UUID NOT NULL,created_by VARCHAR(128) NOT NULL,
 binding_id UUID NOT NULL,config JSONB NOT NULL,config_version UUID NOT NULL,credential_cipher TEXT,
 revision INTEGER NOT NULL DEFAULT 1,state VARCHAR(16) NOT NULL DEFAULT 'paused' CHECK(state IN ('paused','active','deleted')),
 confirmed BOOLEAN NOT NULL DEFAULT false,interval_minutes INTEGER NOT NULL DEFAULT 0,next_due TIMESTAMPTZ,
 cursor TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_version (
 id UUID PRIMARY KEY,connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),config JSONB NOT NULL,config_hash VARCHAR(64) NOT NULL,
 created_by VARCHAR(128) NOT NULL,note TEXT NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_run (
 id UUID PRIMARY KEY,connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),config_version UUID NOT NULL,
 mode VARCHAR(16) NOT NULL CHECK(mode IN ('preview','sync')),full_scan BOOLEAN NOT NULL,
 state VARCHAR(16) NOT NULL DEFAULT 'scanning' CHECK(state IN ('scanning','review','applying','done','partial','failed','cancelled')),
 revision INTEGER NOT NULL DEFAULT 1,scan JSONB NOT NULL,apply_offset INTEGER NOT NULL DEFAULT 0,
 current_batch JSONB,heads_hash VARCHAR(64) NOT NULL,deletions JSONB NOT NULL DEFAULT '[]',deletion_state VARCHAR(16) NOT NULL DEFAULT 'pending',
 lease_id UUID,lease_until TIMESTAMPTZ,attempt INTEGER NOT NULL DEFAULT 0,error_code VARCHAR(80),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_head (
 connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),source_key VARCHAR(80) NOT NULL,url TEXT NOT NULL,title VARCHAR(512) NOT NULL,
 content_hash VARCHAR(64),etag TEXT,modified TEXT,deleted BOOLEAN NOT NULL DEFAULT false,
 source_version INTEGER NOT NULL DEFAULT 0,document_id UUID,last_run UUID NOT NULL,
 PRIMARY KEY(connector_id,source_key)
);
CREATE TABLE IF NOT EXISTS karda_kb.automatic_connector_event (
 connector_id UUID NOT NULL REFERENCES karda_kb.automatic_connector(id),revision INTEGER NOT NULL,request_id UUID NOT NULL,
 fingerprint VARCHAR(64) NOT NULL,action VARCHAR(32) NOT NULL,note TEXT NOT NULL,result JSONB NOT NULL,created_by VARCHAR(128) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),PRIMARY KEY(connector_id,revision),UNIQUE(connector_id,request_id)
);
-- END AUTOMATIC CONNECTORS
