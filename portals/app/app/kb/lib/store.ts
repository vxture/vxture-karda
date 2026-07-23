// Persistence port for the knowledge-base asset layer. In-memory for the
// offline/test path; Prisma-backed over karda_kb when DATABASE_URL is set - the
// same two-implementation shape provisioning uses. Importing the Prisma store
// is safe offline: it only `import type`s @prisma/client and loads it lazily.
import { prismaEnabled } from "../../lib/db";
import { PrismaKbStore } from "./prisma-store";
import type { OwnerType, PublishState } from "./ownership";
import type { ContentState, VerificationState } from "./state";

export interface KnowledgeBaseRow {
  id: string;
  workspaceId: string;
  ownerType: OwnerType;
  ownerSub: string | null;
  name: string;
  description: string | null;
  publishState: PublishState;
  processingTemplateId: string | null;
  governanceEnabled: boolean;
  exemptSyncedContent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKbInput {
  workspaceId: string;
  ownerType: OwnerType;
  ownerSub: string | null;
  name: string;
  description?: string | null;
  processingTemplateId?: string | null;
}

/** The columns a caller may change. Deliberately a subset - ownership and
 *  lineage are immutable at the DB (98_column_locks) and must not be offered
 *  here either, or the port would imply a capability the role does not have. */
export interface UpdateKbInput {
  name?: string;
  description?: string | null;
  publishState?: PublishState;
  processingTemplateId?: string | null;
  governanceEnabled?: boolean;
  exemptSyncedContent?: boolean;
}

export interface DocumentRow {
  id: string;
  kbId: string;
  folderId: string | null;
  title: string;
  source: "upload" | "api" | "connector";
  connectorCode: string | null;
  contentHash: string | null;
  contentState: ContentState;
  verificationState: VerificationState;
  createdAt: Date;
}

export interface KbStore {
  createKb(input: CreateKbInput): Promise<KnowledgeBaseRow>;
  getKb(id: string): Promise<KnowledgeBaseRow | null>;
  /** Active (not soft-deleted) libraries in a workspace. */
  listKbs(workspaceId: string): Promise<KnowledgeBaseRow[]>;
  updateKb(id: string, patch: UpdateKbInput): Promise<KnowledgeBaseRow | null>;
  /** Soft delete: sets deleted_at, keeps lineage for the audit window. */
  softDeleteKb(id: string): Promise<boolean>;
  /** True if a live library with this (workspace, name) exists, excluding `exceptId`. */
  nameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean>;
}

// --- in-memory ---------------------------------------------------------------

let counter = 0;
function newId(): string {
  // Deterministic enough for tests; the real ids come from gen_random_uuid().
  counter += 1;
  return `kb_${counter.toString(16).padStart(8, "0")}`;
}

export class InMemoryKbStore implements KbStore {
  private rows = new Map<string, KnowledgeBaseRow & { deletedAt: Date | null }>();

  async createKb(input: CreateKbInput): Promise<KnowledgeBaseRow> {
    const now = new Date();
    const row = {
      id: newId(),
      workspaceId: input.workspaceId,
      ownerType: input.ownerType,
      ownerSub: input.ownerSub,
      name: input.name,
      description: input.description ?? null,
      publishState: "private" as PublishState,
      processingTemplateId: input.processingTemplateId ?? null,
      governanceEnabled: false,
      exemptSyncedContent: true,
      createdAt: now,
      updatedAt: now,
      deletedAt: null as Date | null,
    };
    this.rows.set(row.id, row);
    return strip(row);
  }

  async getKb(id: string): Promise<KnowledgeBaseRow | null> {
    const r = this.rows.get(id);
    return r && !r.deletedAt ? strip(r) : null;
  }

  async listKbs(workspaceId: string): Promise<KnowledgeBaseRow[]> {
    return [...this.rows.values()]
      .filter((r) => r.workspaceId === workspaceId && !r.deletedAt)
      .map(strip);
  }

  async updateKb(id: string, patch: UpdateKbInput): Promise<KnowledgeBaseRow | null> {
    const r = this.rows.get(id);
    if (!r || r.deletedAt) return null;
    Object.assign(r, patch, { updatedAt: new Date() });
    return strip(r);
  }

  async softDeleteKb(id: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r || r.deletedAt) return false;
    r.deletedAt = new Date();
    return true;
  }

  async nameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean> {
    return [...this.rows.values()].some(
      (r) => r.workspaceId === workspaceId && r.name === name && !r.deletedAt && r.id !== exceptId,
    );
  }
}

function strip(r: KnowledgeBaseRow & { deletedAt: Date | null }): KnowledgeBaseRow {
  const { deletedAt: _omit, ...rest } = r;
  return rest;
}

// --- selection ---------------------------------------------------------------

export function getKbStore(): KbStore {
  return prismaEnabled() ? new PrismaKbStore() : new InMemoryKbStore();
}
