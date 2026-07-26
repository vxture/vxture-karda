// Connector data-plane (Track 11b): apply a parsed ingest envelope to karda's
// document records, and cascade a revoke. No schema change - document.source_ref
// (JSON, immutable) already carries the stable id and holds the binding id, and
// idx_document_source_doc_id indexes the locator.
//
// Because source_ref and content_hash are immutable (98_column_locks), a changed
// document is a SUPERSEDE, not an in-place edit: tombstone the prior live row and
// insert a new one (the writable content_state moves the old to `deleted`). That
// keeps the dedup index honest and preserves lineage rather than rewriting it.
import type { ContentService } from "../lib/content-service";
import type { KbStore } from "../lib/store";
import type { ObjectStore } from "../storage/objectstore";
import type { TaskQueue } from "../processing/queue";
import type { BindingStore } from "./binding-store";
import { enqueueForDocument } from "../processing/runtime";
import type { IngestEnvelope } from "./envelope";

export interface IngestDeps {
  content: ContentService;
  bindings: BindingStore;
  kbs: KbStore;
  objects: ObjectStore;
  queue: TaskQueue;
}

export type IngestOutcome =
  | { status: "created"; documentId: string }
  | { status: "superseded"; documentId: string; supersededId: string }
  | { status: "unchanged" }
  | { status: "parked"; documentId: string } // record created, awaiting fetch (fetch=ref)
  | { status: "deleted"; documentId: string }
  | { status: "absent" };

export type IngestError =
  | { code: "binding_not_found" }
  | { code: "binding_inactive" }
  | { code: "kb_not_found" }
  | { code: "bad_content" };

export type Result<T> = { ok: true; value: T } | { ok: false; error: IngestError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: IngestError): Result<never> => ({ ok: false, error });

/**
 * Apply one envelope. A paused / revoked binding refuses ingest (only `active`
 * accepts). Idempotent on the content hash: an upsert whose hash matches the live
 * document is a no-op ack (this also absorbs a change-and-change-back).
 */
export async function ingestEnvelope(env: IngestEnvelope, deps: IngestDeps): Promise<Result<IngestOutcome>> {
  const binding = await deps.bindings.get(env.bindingId);
  if (!binding) return err({ code: "binding_not_found" });
  if (binding.state !== "active") return err({ code: "binding_inactive" });
  const kb = await deps.kbs.getKb(binding.kbId);
  if (!kb) return err({ code: "kb_not_found" });

  const live = await deps.content.findLiveConnectorDocument(kb.id, binding.connectorCode, env.sourceDocId);

  if (env.event === "delete") {
    if (!live) return ok({ status: "absent" });
    await deps.content.transitionDocument(live.id, "deleted");
    return ok({ status: "deleted", documentId: live.id });
  }

  // upsert - unchanged hash is an ack, nothing to do.
  if (live && live.contentHash === env.contentHash) return ok({ status: "unchanged" });

  // source_ref is written once and never mutated - it carries the stable id, the
  // binding (for the revoke cascade), and the source pointers.
  const sourceRef: Record<string, unknown> = {
    source_doc_id: env.sourceDocId,
    binding_id: binding.id,
    uri: env.sourceRef?.uri ?? null,
    external_version: env.sourceRef?.externalVersion ?? null,
    fetch_ref: env.content?.fetchRef ?? null,
  };

  // fetch=direct carries bytes now; fetch=ref carries only a reference, so the
  // record is created but parks until the fetch client retrieves it (deferred,
  // arda-specific) - like a document parking at embed, nothing is lost.
  let storageRef: string | null = null;
  let sizeBytes: number | null = env.content?.size ?? null;
  if (env.content?.bytes) {
    const bytes = Buffer.from(env.content.bytes, "base64");
    const stored = await deps.objects.put(kb.workspaceId, kb.id, bytes);
    storageRef = stored.key;
    sizeBytes = stored.sizeBytes;
  }

  const created = await deps.content.createDocument({
    kbId: kb.id,
    title: env.sourceRef?.uri || env.sourceDocId,
    source: "connector",
    connectorCode: binding.connectorCode,
    sourceRef,
    contentHash: env.contentHash,
    storageRef,
    mime: env.content?.mime ?? null,
    sizeBytes,
  });
  if (!created.ok) return err({ code: "bad_content" });

  // Supersede: the old version for this stable id leaves the live set.
  if (live) await deps.content.transitionDocument(live.id, "deleted");

  // Enqueue for processing: backfill goes to the bulk tier, steady incremental to
  // sync (110-processing; tierForTrigger).
  enqueueForDocument(deps.queue, {
    docId: created.value.id,
    kbId: kb.id,
    workspaceId: kb.workspaceId,
    contentHash: created.value.contentHash,
    config: { processingTemplateId: kb.processingTemplateId, processingParams: {}, embeddingModel: null },
    trigger: binding.mode === "backfill" ? "backfill" : "connector_sync",
  });

  if (!storageRef) return ok({ status: "parked", documentId: created.value.id });
  return live
    ? ok({ status: "superseded", documentId: created.value.id, supersededId: live.id })
    : ok({ status: "created", documentId: created.value.id });
}

/**
 * Revoke cascade (220-connector-framework section 7): a revoked binding's content
 * leaves recall immediately by moving every live connector document of that
 * binding to `deleted`. Physical purge and the audit-window lineage retention are
 * downstream; this is the recall-exclusion half, which is the compliance-critical
 * one. Call after BindingService.revoke has set the terminal state.
 */
export async function revokeCascade(bindingId: string, deps: IngestDeps): Promise<{ tombstoned: number }> {
  const binding = await deps.bindings.get(bindingId);
  if (!binding) return { tombstoned: 0 };
  const docs = await deps.content.listLiveConnectorDocsByBinding(binding.kbId, bindingId);
  let tombstoned = 0;
  for (const d of docs) {
    await deps.content.transitionDocument(d.id, "deleted");
    tombstoned += 1;
  }
  return { tombstoned };
}
