BEGIN;
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
-- BEGIN GRAPH CENTERS LOCKS
REVOKE UPDATE,DELETE ON karda_kb.graph_index,karda_kb.graph_asset,karda_kb.graph_asset_version,karda_kb.graph_control FROM karda_svc;
GRANT SELECT,INSERT ON karda_kb.graph_index,karda_kb.graph_asset,karda_kb.graph_asset_version,karda_kb.graph_control TO karda_svc;
GRANT UPDATE(state,revision,attempt,lease_id,lease_until,target_hash,active_hash,node_count,edge_count,manifest,error_code,updated_at) ON karda_kb.graph_index TO karda_svc;
GRANT UPDATE(title,visibility,draft,revision,state,active_version,updated_at) ON karda_kb.graph_asset TO karda_svc;
-- END GRAPH CENTERS LOCKS
COMMIT;
