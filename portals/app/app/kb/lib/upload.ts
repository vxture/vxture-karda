// The upload flow: the seam between raw bytes (object storage) and the document
// record (content store). This is the "文档归集" path a user drives - upload a
// file into a library, optionally under a folder. It stores karda's own copy of
// the bytes, then creates the Document record pointing at it.
//
// It does NOT run the processing pipeline: the document lands in `processing`
// (its initial content state) and a task worker (TD-007) advances it later. So
// upload/list/get/delete of the raw document work end-to-end today, independent
// of whether indexing has run - which is exactly the document-management surface
// the user asked for.
import { CapacityError } from "./capacity";
import type { ContentService } from "./content-service";
import type { ObjectStore } from "../storage/objectstore";
import { contentHashOf } from "../storage/objectstore";
import type { DocumentRow } from "./content-store";

export type UploadError =
  | { code: "capacity_exceeded" | "capacity_unconfigured" | "capacity_unavailable" }
  | { code: "not_found" }
  | { code: "folder_not_in_kb" }
  | { code: "empty_file" }
  | { code: "duplicate_document" }
  | { code: "folder_name_taken" };

export type Result<T> = { ok: true; value: T } | { ok: false; error: UploadError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: UploadError): Result<never> => ({ ok: false, error });

export interface UploadInput {
  kbId: string;
  workspaceId: string;
  folderId?: string | null;
  title: string;
  mime: string;
  bytes: Buffer;
  /** Row-level provenance: which product surface wrote this, and as which user
   *  (null on a service-mode write). */
  createdInProduct?: string | null;
  createdBy?: string | null;
}

/**
 * Compose object storage + the content service for a single upload. The dedup
 * check is done up front against the content hash so a re-upload of identical
 * bytes returns a clear duplicate error rather than a second record (and the
 * object store is content-addressed, so the bytes were not doubled either).
 */
export async function uploadDocument(
  input: UploadInput,
  content: ContentService,
  objects: ObjectStore,
  // Optional: called once, after the document record is created, to enqueue it
  // for processing (TD-007). Kept as an injected hook so upload stays pure and
  // testable, and so a caller that only wants the raw document (no indexing) can
  // omit it. It runs only on a successful create - never for a duplicate.
  enqueue?: (doc: DocumentRow) => void | Promise<void>,
): Promise<Result<DocumentRow>> {
  if (input.bytes.length === 0) return err({ code: "empty_file" });

  // A folder, if given, must belong to this KB - a document cannot be filed
  // under a folder from another library.
  if (input.folderId) {
    const folders = await content.listFolders(input.kbId);
    if (!folders.some((f) => f.id === input.folderId)) {
      return err({ code: "folder_not_in_kb" });
    }
  }

  const hash = contentHashOf(input.bytes);

  // Production storage reserves bytes before PUT. A rejected metadata write
  // leaves an unreferenced tracked object for reference-aware recovery.
  let stored;
  try { stored = await objects.put(input.workspaceId, input.kbId, input.bytes); }
  catch (error) {
    if (error instanceof CapacityError) return err({ code: error.code });
    throw error;
  }
  const created = await content.createDocument({
    kbId: input.kbId,
    folderId: input.folderId ?? null,
    title: input.title,
    source: "upload",
    contentHash: hash,
    storageRef: stored.key,
    mime: input.mime,
    sizeBytes: stored.sizeBytes,
    createdInProduct: input.createdInProduct ?? null,
    createdBy: input.createdBy ?? null,
  });

  if (!created.ok) {
    // Do not delete here: other retained documents may share the same object.
    return err(mapContentError(created.error.code));
  }
  if (enqueue) await enqueue(created.value);
  return ok(created.value);
}

/**
 * Fetch a document's raw bytes for download. Returns null if the document or its
 * stored object is gone.
 */
export async function downloadDocument(
  docId: string,
  content: ContentService,
  objects: ObjectStore,
): Promise<{ doc: DocumentRow; bytes: Buffer } | null> {
  const got = await content.getDocument(docId);
  if (!got.ok || !got.value.storageRef) return null;
  const bytes = await objects.get(got.value.storageRef);
  if (!bytes) return null;
  return { doc: got.value, bytes };
}

function mapContentError(code: string): UploadError {
  if (code === "duplicate_document") return { code: "duplicate_document" };
  if (code === "capacity_exceeded" || code === "capacity_unconfigured" || code === "capacity_unavailable") return { code };
  return { code: "not_found" };
}
