// Persistence port for a knowledge base's CONTENTS: folders, documents, entries.
// Separate from KbStore (which owns the library lifecycle) because these are a
// different aggregate with a different shape - a KB is a governance/permission
// anchor, its contents are the things governed. In-memory for offline/tests,
// Prisma over karda_kb when DATABASE_URL is set.
import { prismaEnabled } from "../../lib/db";
import { PrismaContentStore } from "./content-prisma-store";
import type { ContentState, VerificationState } from "./state";

export interface FolderRow {
  id: string;
  kbId: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export type DocumentSource = "upload" | "api" | "connector";

export interface DocumentRow {
  id: string;
  kbId: string;
  folderId: string | null;
  title: string;
  source: DocumentSource;
  connectorCode: string | null;
  /** Connector provenance (immutable): source_doc_id / binding_id / uri / etc. */
  sourceRef: Record<string, unknown> | null;
  contentHash: string | null;
  storageRef: string | null;
  mime: string | null;
  sizeBytes: number | null;
  contentState: ContentState;
  failureReason: string | null;
  verificationState: VerificationState;
  verifier: string | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  /** Row-level provenance; optional so pre-existing rows read back as absent. */
  createdInProduct?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EntryRow {
  id: string;
  kbId: string;
  folderId: string | null;
  title: string | null;
  contentTemplateId: string;
  templateVersion: number;
  fields: Record<string, unknown>;
  contentState: ContentState;
  verificationState: VerificationState;
  verifier: string | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
  /** Row-level provenance; optional so pre-existing rows read back as absent. */
  createdInProduct?: string | null;
  createdBy?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The governance columns a verify / expiry transition writes together. */
export interface VerificationPatch {
  verificationState: VerificationState;
  verifier: string | null;
  verifiedAt: Date | null;
  expiresAt: Date | null;
}

/** A content item whose verification clock has run out - a stale-sweep candidate. */
export interface DueItem {
  kind: "document" | "entry";
  id: string;
  kbId: string;
}

export interface CreateDocumentInput {
  kbId: string;
  folderId?: string | null;
  title: string;
  source: DocumentSource;
  connectorCode?: string | null;
  sourceRef?: Record<string, unknown> | null;
  contentHash?: string | null;
  storageRef?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
  // Row-level provenance (blueprint Q14 / 230-runos-channel 5.5): which product
  // surface wrote this, and as which user (null on a service-mode write). The
  // columns existed from day one; every write path now fills them.
  createdInProduct?: string | null;
  createdBy?: string | null;
}

export interface CreateEntryInput {
  kbId: string;
  folderId?: string | null;
  title?: string | null;
  contentTemplateId: string;
  templateVersion: number;
  fields: Record<string, unknown>;
  createdInProduct?: string | null;
  createdBy?: string | null;
}

export interface ContentStore {
  // folders
  createFolder(kbId: string, name: string): Promise<FolderRow>;
  listFolders(kbId: string): Promise<FolderRow[]>;
  /** `exceptId` excludes the folder being renamed, so keeping its own name is
   *  not a collision with itself. */
  folderNameTaken(kbId: string, name: string, exceptId?: string): Promise<boolean>;
  renameFolder(id: string, name: string): Promise<FolderRow | null>;
  deleteFolder(id: string): Promise<boolean>;

  // documents
  createDocument(input: CreateDocumentInput): Promise<DocumentRow>;
  getDocument(id: string): Promise<DocumentRow | null>;
  listDocuments(kbId: string): Promise<DocumentRow[]>;
  setDocumentState(
    id: string,
    state: ContentState,
    failureReason?: string | null,
  ): Promise<DocumentRow | null>;
  /** True if a live document with this dedup key already exists in the KB. */
  documentExists(
    kbId: string,
    source: DocumentSource,
    connectorCode: string | null,
    contentHash: string,
  ): Promise<boolean>;
  /** The live (non-deleted) connector document for a stable source id, if any -
   *  the locator for a connector upsert/tombstone (220-connector-framework I1). */
  findLiveConnectorDocument(kbId: string, connectorCode: string, sourceDocId: string): Promise<DocumentRow | null>;
  /** Live connector documents belonging to a binding - the revoke cascade set. */
  listLiveConnectorDocsByBinding(kbId: string, bindingId: string): Promise<DocumentRow[]>;

  // entries
  createEntry(input: CreateEntryInput): Promise<EntryRow>;
  getEntry(id: string): Promise<EntryRow | null>;
  listEntries(kbId: string): Promise<EntryRow[]>;
  updateEntryFields(id: string, fields: Record<string, unknown>): Promise<EntryRow | null>;
  setEntryState(id: string, state: ContentState): Promise<EntryRow | null>;

  // governance (verification state machine - the orthogonal, human-driven axis)
  setDocumentVerification(id: string, patch: VerificationPatch): Promise<DocumentRow | null>;
  setEntryVerification(id: string, patch: VerificationPatch): Promise<EntryRow | null>;
  /** Verified items whose expiresAt has passed - candidates for the stale sweep.
   *
   *  `kbIds` narrows the scan. It is optional because the CRON sweep is global
   *  by design, but any sweep a USER can trigger must pass it: without a filter
   *  one tenant clicking a button would scan and re-state every other tenant's
   *  corpus. */
  dueForStale(now: Date, limit: number, kbIds?: string[]): Promise<DueItem[]>;
}

// --- in-memory ---------------------------------------------------------------

let seq = 0;
const nid = (p: string) => `${p}_${(seq += 1).toString(16).padStart(8, "0")}`;

export class InMemoryContentStore implements ContentStore {
  private folders = new Map<string, FolderRow>();
  private docs = new Map<string, DocumentRow & { deleted: boolean }>();
  private entries = new Map<string, EntryRow>();

  async createFolder(kbId: string, name: string): Promise<FolderRow> {
    const now = new Date();
    const row: FolderRow = { id: nid("fld"), kbId, name, createdAt: now, updatedAt: now };
    this.folders.set(row.id, row);
    return row;
  }
  async listFolders(kbId: string): Promise<FolderRow[]> {
    return [...this.folders.values()].filter((f) => f.kbId === kbId);
  }
  async folderNameTaken(kbId: string, name: string, exceptId?: string): Promise<boolean> {
    return [...this.folders.values()].some(
      (f) => f.kbId === kbId && f.name === name && f.id !== exceptId,
    );
  }
  async renameFolder(id: string, name: string): Promise<FolderRow | null> {
    const f = this.folders.get(id);
    if (!f) return null;
    const row: FolderRow = { ...f, name, updatedAt: new Date() };
    this.folders.set(id, row);
    return row;
  }
  async deleteFolder(id: string): Promise<boolean> {
    return this.folders.delete(id);
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
    const now = new Date();
    const row = {
      id: nid("doc"),
      kbId: input.kbId,
      folderId: input.folderId ?? null,
      title: input.title,
      source: input.source,
      connectorCode: input.connectorCode ?? null,
      sourceRef: input.sourceRef ?? null,
      contentHash: input.contentHash ?? null,
      storageRef: input.storageRef ?? null,
      mime: input.mime ?? null,
      sizeBytes: input.sizeBytes ?? null,
      contentState: "processing" as ContentState,
      failureReason: null as string | null,
      verificationState: "unverified" as VerificationState,
      verifier: null as string | null,
      verifiedAt: null as Date | null,
      expiresAt: null as Date | null,
      createdInProduct: input.createdInProduct ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
      deleted: false,
    };
    this.docs.set(row.id, row);
    return strip(row);
  }
  async getDocument(id: string): Promise<DocumentRow | null> {
    const d = this.docs.get(id);
    return d && !d.deleted ? strip(d) : null;
  }
  async listDocuments(kbId: string): Promise<DocumentRow[]> {
    return [...this.docs.values()].filter((d) => d.kbId === kbId && !d.deleted).map(strip);
  }
  async setDocumentState(
    id: string,
    state: ContentState,
    failureReason: string | null = null,
  ): Promise<DocumentRow | null> {
    const d = this.docs.get(id);
    if (!d || d.deleted) return null;
    d.contentState = state;
    d.failureReason = state === "failed" ? failureReason : null;
    d.updatedAt = new Date();
    if (state === "deleted") d.deleted = true;
    return strip(d);
  }
  async documentExists(
    kbId: string,
    source: DocumentSource,
    connectorCode: string | null,
    contentHash: string,
  ): Promise<boolean> {
    return [...this.docs.values()].some(
      (d) =>
        !d.deleted &&
        d.kbId === kbId &&
        d.source === source &&
        (d.connectorCode ?? "") === (connectorCode ?? "") &&
        d.contentHash === contentHash,
    );
  }
  async findLiveConnectorDocument(kbId: string, connectorCode: string, sourceDocId: string): Promise<DocumentRow | null> {
    const d = [...this.docs.values()].find(
      (x) =>
        !x.deleted &&
        x.kbId === kbId &&
        x.source === "connector" &&
        x.connectorCode === connectorCode &&
        (x.sourceRef?.source_doc_id ?? null) === sourceDocId,
    );
    return d ? strip(d) : null;
  }
  async listLiveConnectorDocsByBinding(kbId: string, bindingId: string): Promise<DocumentRow[]> {
    return [...this.docs.values()]
      .filter((x) => !x.deleted && x.kbId === kbId && x.source === "connector" && (x.sourceRef?.binding_id ?? null) === bindingId)
      .map(strip);
  }

  async createEntry(input: CreateEntryInput): Promise<EntryRow> {
    const now = new Date();
    const row: EntryRow = {
      id: nid("ent"),
      kbId: input.kbId,
      folderId: input.folderId ?? null,
      title: input.title ?? null,
      contentTemplateId: input.contentTemplateId,
      templateVersion: input.templateVersion,
      fields: input.fields,
      contentState: "draft",
      verificationState: "unverified",
      verifier: null,
      verifiedAt: null,
      expiresAt: null,
      createdInProduct: input.createdInProduct ?? null,
      createdBy: input.createdBy ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.entries.set(row.id, row);
    return row;
  }
  async getEntry(id: string): Promise<EntryRow | null> {
    return this.entries.get(id) ?? null;
  }
  async listEntries(kbId: string): Promise<EntryRow[]> {
    return [...this.entries.values()].filter((e) => e.kbId === kbId);
  }
  async updateEntryFields(id: string, fields: Record<string, unknown>): Promise<EntryRow | null> {
    const e = this.entries.get(id);
    if (!e) return null;
    e.fields = fields;
    e.updatedAt = new Date();
    return e;
  }
  async setEntryState(id: string, state: ContentState): Promise<EntryRow | null> {
    const e = this.entries.get(id);
    if (!e) return null;
    e.contentState = state;
    e.updatedAt = new Date();
    return e;
  }

  async setDocumentVerification(id: string, patch: VerificationPatch): Promise<DocumentRow | null> {
    const d = this.docs.get(id);
    if (!d || d.deleted) return null;
    d.verificationState = patch.verificationState;
    d.verifier = patch.verifier;
    d.verifiedAt = patch.verifiedAt;
    d.expiresAt = patch.expiresAt;
    d.updatedAt = new Date();
    return strip(d);
  }
  async setEntryVerification(id: string, patch: VerificationPatch): Promise<EntryRow | null> {
    const e = this.entries.get(id);
    if (!e) return null;
    e.verificationState = patch.verificationState;
    e.verifier = patch.verifier;
    e.verifiedAt = patch.verifiedAt;
    e.expiresAt = patch.expiresAt;
    e.updatedAt = new Date();
    return e;
  }
  async dueForStale(now: Date, limit: number, kbIds?: string[]): Promise<DueItem[]> {
    const scope = kbIds ? new Set(kbIds) : null;
    const out: DueItem[] = [];
    for (const d of this.docs.values()) {
      if (scope && !scope.has(d.kbId)) continue;
      if (!d.deleted && d.verificationState === "verified" && d.expiresAt && d.expiresAt <= now) {
        out.push({ kind: "document", id: d.id, kbId: d.kbId });
        if (out.length >= limit) return out;
      }
    }
    for (const e of this.entries.values()) {
      if (scope && !scope.has(e.kbId)) continue;
      if (e.contentState !== "deleted" && e.verificationState === "verified" && e.expiresAt && e.expiresAt <= now) {
        out.push({ kind: "entry", id: e.id, kbId: e.kbId });
        if (out.length >= limit) return out;
      }
    }
    return out;
  }
}

function strip(d: DocumentRow & { deleted: boolean }): DocumentRow {
  const { deleted: _omit, ...rest } = d;
  return rest;
}

export function getContentStore(): ContentStore {
  return prismaEnabled() ? new PrismaContentStore() : new InMemoryContentStore();
}
