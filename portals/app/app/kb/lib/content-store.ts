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
  contentHash: string | null;
  storageRef: string | null;
  mime: string | null;
  sizeBytes: number | null;
  contentState: ContentState;
  failureReason: string | null;
  verificationState: VerificationState;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateDocumentInput {
  kbId: string;
  folderId?: string | null;
  title: string;
  source: DocumentSource;
  connectorCode?: string | null;
  contentHash?: string | null;
  storageRef?: string | null;
  mime?: string | null;
  sizeBytes?: number | null;
}

export interface CreateEntryInput {
  kbId: string;
  folderId?: string | null;
  title?: string | null;
  contentTemplateId: string;
  templateVersion: number;
  fields: Record<string, unknown>;
}

export interface ContentStore {
  // folders
  createFolder(kbId: string, name: string): Promise<FolderRow>;
  listFolders(kbId: string): Promise<FolderRow[]>;
  folderNameTaken(kbId: string, name: string, exceptId?: string): Promise<boolean>;
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

  // entries
  createEntry(input: CreateEntryInput): Promise<EntryRow>;
  getEntry(id: string): Promise<EntryRow | null>;
  listEntries(kbId: string): Promise<EntryRow[]>;
  updateEntryFields(id: string, fields: Record<string, unknown>): Promise<EntryRow | null>;
  setEntryState(id: string, state: ContentState): Promise<EntryRow | null>;
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
      contentHash: input.contentHash ?? null,
      storageRef: input.storageRef ?? null,
      mime: input.mime ?? null,
      sizeBytes: input.sizeBytes ?? null,
      contentState: "processing" as ContentState,
      failureReason: null as string | null,
      verificationState: "unverified" as VerificationState,
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
}

function strip(d: DocumentRow & { deleted: boolean }): DocumentRow {
  const { deleted: _omit, ...rest } = d;
  return rest;
}

export function getContentStore(): ContentStore {
  return prismaEnabled() ? new PrismaContentStore() : new InMemoryContentStore();
}
