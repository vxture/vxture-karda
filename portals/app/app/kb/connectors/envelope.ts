// The minimal ingest envelope (220-connector-framework section 6): the single
// shape every connector hands karda, whether it arrived by poll or by notify.
// This is the pure parse/validate side of the contract - the data-plane that
// applies an envelope to a Document (upsert -> create/reprocess, delete ->
// tombstone) lands with the document<->binding linkage; defining the shape now
// keeps that contract fixed and testable ahead of it.

export type EnvelopeEvent = "upsert" | "delete";

export interface EnvelopeSourceRef {
  uri?: string;
  externalVersion?: string;
}

export interface EnvelopeContent {
  mime?: string;
  size?: number;
  /** base64 bytes (fetch=direct) - exactly one of bytes / fetchRef on an upsert. */
  bytes?: string;
  /** short-lived fetch reference (fetch=ref). */
  fetchRef?: string;
}

export interface IngestEnvelope {
  bindingId: string;
  event: EnvelopeEvent;
  /** I1 stable id - constant across sync cycles; the tombstone/update locator. */
  sourceDocId: string;
  /** I3 change key - required on upsert, absent on delete. */
  contentHash: string | null;
  sourceRef: EnvelopeSourceRef | null;
  content: EnvelopeContent | null;
}

export type ParseResult = { ok: true; value: IngestEnvelope } | { ok: false; error: string };

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/**
 * Validate a raw envelope. The rules that carry weight: an upsert must name its
 * change (contentHash) and carry content as exactly one of bytes / fetchRef (the
 * fetch=direct vs fetch=ref split); a delete carries neither - it only needs the
 * stable id to locate what to tombstone.
 */
export function parseEnvelope(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object") return { ok: false, error: "envelope must be an object" };
  const o = raw as Record<string, unknown>;

  const bindingId = str(o.binding_id ?? o.bindingId);
  if (!bindingId) return { ok: false, error: "binding_id is required" };
  const sourceDocId = str(o.source_doc_id ?? o.sourceDocId);
  if (!sourceDocId) return { ok: false, error: "source_doc_id is required" };

  const event = o.event;
  if (event !== "upsert" && event !== "delete") return { ok: false, error: "event must be 'upsert' or 'delete'" };

  const sr = (o.source_ref ?? o.sourceRef) as Record<string, unknown> | undefined;
  const sourceRef: EnvelopeSourceRef | null = sr
    ? { uri: str(sr.uri) ?? undefined, externalVersion: str(sr.external_version ?? sr.externalVersion) ?? undefined }
    : null;

  if (event === "delete") {
    return { ok: true, value: { bindingId, event, sourceDocId, contentHash: null, sourceRef, content: null } };
  }

  // upsert
  const contentHash = str(o.content_hash ?? o.contentHash);
  if (!contentHash) return { ok: false, error: "content_hash is required on an upsert" };

  const c = (o.content ?? {}) as Record<string, unknown>;
  const bytes = str(c.bytes);
  const fetchRef = str(c.fetch_ref ?? c.fetchRef);
  if (!bytes && !fetchRef) return { ok: false, error: "upsert content must carry bytes or fetch_ref" };
  if (bytes && fetchRef) return { ok: false, error: "upsert content carries bytes XOR fetch_ref, not both" };

  const size = typeof c.size === "number" && Number.isFinite(c.size) ? c.size : undefined;
  const content: EnvelopeContent = { mime: str(c.mime) ?? undefined, size, bytes: bytes ?? undefined, fetchRef: fetchRef ?? undefined };
  return { ok: true, value: { bindingId, event, sourceDocId, contentHash, sourceRef, content } };
}
