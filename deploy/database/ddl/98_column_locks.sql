-- Column-level UPDATE whitelist (governance section 7). REVOKE table UPDATE, then
-- GRANT only the writable columns. Anchor columns (id, *_id reference keys,
-- created_at) are never writable. Append-only / link tables get no UPDATE at all.
-- Adding a writable column requires updating this whitelist, or the service write
-- fails with permission denied.

-- --- vx_provision ---
REVOKE UPDATE ON vx_provision.app_instance FROM karda_svc;
GRANT UPDATE (status, env, provisioned_at, updated_at)
  ON vx_provision.app_instance TO karda_svc;

-- webhook_delivery: append-only idempotency ledger -> no UPDATE.
REVOKE UPDATE ON vx_provision.webhook_delivery FROM karda_svc;

REVOKE UPDATE ON vx_provision.provision_seq FROM karda_svc;
GRANT UPDATE (last_seq, updated_at)
  ON vx_provision.provision_seq TO karda_svc;

-- --- local_authz ---
REVOKE UPDATE ON local_authz.member FROM karda_svc;
GRANT UPDATE (display_name, avatar_hash, status, updated_at)
  ON local_authz.member TO karda_svc;

-- role / permission catalogs are seeded via db-init, not mutated at runtime.
REVOKE UPDATE ON local_authz.role FROM karda_svc;
REVOKE UPDATE ON local_authz.permission FROM karda_svc;

-- link tables: insert/delete only.
REVOKE UPDATE ON local_authz.member_role FROM karda_svc;
REVOKE UPDATE ON local_authz.role_permission FROM karda_svc;

-- --- local_usage ---
-- raw: the flush job flips `flushed`; nothing else is mutable.
REVOKE UPDATE ON local_usage.raw FROM karda_svc;
GRANT UPDATE (flushed) ON local_usage.raw TO karda_svc;

REVOKE UPDATE ON local_usage.checkpoint FROM karda_svc;
GRANT UPDATE (flushed_at) ON local_usage.checkpoint TO karda_svc;

-- --- karda_kb (domain; authority = docs/30-design/210-data-model.md section 4) ---
-- Anchor columns are absent from every whitelist below: id, all *_id reference
-- keys, and created_at. Ownership and lineage (workspace_id, owner_type,
-- owner_sub, origin_kb_id, origin_snapshot_at) are equally immutable - once a
-- library's owner or provenance is established, changing it would rewrite
-- history rather than record it.

REVOKE UPDATE ON karda_kb.knowledge_base FROM karda_svc;
GRANT UPDATE (name, description, publish_state, processing_template_id,
              processing_params, embedding_model, fulltext_enabled, graph_enabled,
              retrieval_defaults, governance_enabled, default_verifier,
              default_verify_interval_days, exempt_synced_content, deleted_at,
              updated_at)
  ON karda_kb.knowledge_base TO karda_svc;

REVOKE UPDATE ON karda_kb.folder FROM karda_svc;
GRANT UPDATE (name, updated_at) ON karda_kb.folder TO karda_svc;

-- document: kb_id / source / source_ref / content_hash stay immutable - they are
-- the provenance and the dedup key; a mutable hash would make the idempotency
-- index lie.
REVOKE UPDATE ON karda_kb.document FROM karda_svc;
GRANT UPDATE (title, folder_id, processing_template_id, storage_ref,
              content_state, failure_reason, failed_at, verification_state,
              verifier, verified_at, expires_at, sensitivity, business_meta,
              updated_at)
  ON karda_kb.document TO karda_svc;
-- storage_ref IS writable: the pipeline fills it once the raw file lands in
-- karda's object storage, and a controlled rebuild may relocate it. source /
-- connector_code / source_ref / content_hash stay immutable - they are the
-- provenance and the dedup key.

REVOKE UPDATE ON karda_kb.entry FROM karda_svc;
GRANT UPDATE (title, folder_id, content_template_id, template_version, fields,
              content_state, failure_reason, failed_at, verification_state,
              verifier, verified_at, expires_at, sensitivity, business_meta,
              updated_at)
  ON karda_kb.entry TO karda_svc;

-- chunk: derived data, rebuilt rather than edited. Granting nothing here forces
-- content changes through the processing pipeline's atomic replace, so index and
-- source cannot silently diverge via a stray UPDATE.
REVOKE UPDATE ON karda_kb.chunk FROM karda_svc;

-- Template and field declarations are seeded / changed through the admin path,
-- and evolution means a new version row - never an in-place edit.
REVOKE UPDATE ON karda_kb.processing_template FROM karda_svc;
REVOKE UPDATE ON karda_kb.content_template FROM karda_svc;
REVOKE UPDATE ON karda_kb.content_template_field FROM karda_svc;
REVOKE UPDATE ON karda_kb.kb_metadata_field FROM karda_svc;

-- binding: kb_id / connector_code / external_source_id / created_by are the
-- subscription's identity and its OBO provenance - changing any of them would
-- silently repoint an existing sync at a different source or owner rather than
-- creating a new subscription.
REVOKE UPDATE ON karda_kb.binding FROM karda_svc;
GRANT UPDATE (mode, state, cursor, last_synced_at, updated_at)
  ON karda_kb.binding TO karda_svc;
