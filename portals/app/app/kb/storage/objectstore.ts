// Object storage for raw uploaded files - karda self-hosts its own copy
// (110-processing 1: raw preservation; direction 2026-07-23: self-closing, does
// not depend on a connector staying reachable). A port with a filesystem
// implementation now; the seam swaps to S3/MinIO later without touching callers.
//
// document.storage_ref holds the key returned here. The key is opaque to the
// rest of the system - only this module knows it maps to a path/bucket object.
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink, stat } from "node:fs/promises";
import { join, dirname } from "node:path";

export interface StoredObject {
  /** Opaque key, persisted as document.storage_ref. */
  key: string;
  contentHash: string; // sha256, also the dedup key
  sizeBytes: number;
}

export interface ObjectStore {
  put(workspaceId: string, kbId: string, bytes: Buffer): Promise<StoredObject>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
}

/** sha256 hex of the bytes - the content hash used for dedup and the key. */
export function contentHashOf(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

// --- filesystem implementation ----------------------------------------------

/**
 * Stores objects under a root, sharded by workspace/kb and content hash so the
 * same bytes land at the same path (content-addressed): re-uploading identical
 * content overwrites the same object rather than duplicating it, which pairs
 * with the (kb, source, hash) dedup at the record layer.
 */
export class FilesystemObjectStore implements ObjectStore {
  constructor(private root: string) {}

  private pathFor(key: string): string {
    // key = ws/kb/ab/cdef... - guard against traversal by rejecting '..'.
    if (key.includes("..")) throw new Error("invalid object key");
    return join(this.root, key);
  }

  async put(workspaceId: string, kbId: string, bytes: Buffer): Promise<StoredObject> {
    const hash = contentHashOf(bytes);
    // content-addressed key: ws/kb/<first2>/<hash>
    const key = `${sanitize(workspaceId)}/${sanitize(kbId)}/${hash.slice(0, 2)}/${hash}`;
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, bytes);
    return { key, contentHash: hash, sizeBytes: bytes.length };
  }

  async get(key: string): Promise<Buffer | null> {
    const path = this.pathFor(key); // throws on traversal - a bad key is a bug, not a miss
    try {
      return await readFile(path);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const path = this.pathFor(key); // throws on traversal, before touching the fs
    try {
      await unlink(path);
      return true;
    } catch {
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await stat(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

function sanitize(s: string): string {
  // ids are uuids/opaque, but keep the path safe regardless.
  return s.replace(/[^A-Za-z0-9_-]/g, "_");
}

// --- in-memory implementation (offline/tests) -------------------------------

export class InMemoryObjectStore implements ObjectStore {
  private map = new Map<string, Buffer>();

  async put(workspaceId: string, kbId: string, bytes: Buffer): Promise<StoredObject> {
    const hash = contentHashOf(bytes);
    const key = `${workspaceId}/${kbId}/${hash}`;
    this.map.set(key, bytes);
    return { key, contentHash: hash, sizeBytes: bytes.length };
  }
  async get(key: string): Promise<Buffer | null> {
    return this.map.get(key) ?? null;
  }
  async delete(key: string): Promise<boolean> {
    return this.map.delete(key);
  }
  get size(): number {
    return this.map.size;
  }
}

// --- selection --------------------------------------------------------------

export function getObjectStore(): ObjectStore {
  const root = process.env.KARDA_OBJECT_ROOT;
  return root ? new FilesystemObjectStore(root) : new InMemoryObjectStore();
}
