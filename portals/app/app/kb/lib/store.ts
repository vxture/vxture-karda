// Persistence port for the knowledge-base asset layer. In-memory for the
// offline/test path; Prisma-backed over karda_kb when DATABASE_URL is set - the
// same two-implementation shape provisioning uses. Importing the Prisma store
// is safe offline: it only `import type`s @prisma/client and loads it lazily.
import { prismaEnabled } from "../../lib/db";
import { PrismaKbStore } from "./prisma-store";
import type { OwnerType, PublishState } from "./ownership";
import type { MetadataFieldDecl } from "./metadata";

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
  /** The default verifier (a user sub) for content in this library (KD-016). */
  defaultVerifier: string | null;
  /** Re-verification interval in days; null = verify once, never expires. */
  defaultVerifyIntervalDays: number | null;
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
  defaultVerifier?: string | null;
  defaultVerifyIntervalDays?: number | null;
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

  // --- business metadata field declarations (100-kb-model 4.3) ---------------
  //
  // Read and REPLACE, with no per-field update - and that is not a convenience
  // choice. 98_column_locks REVOKEs UPDATE on kb_metadata_field, so delete +
  // insert is the only write this role can perform. It also happens to be the
  // shape validateMetadataFields() demands: the cap and the duplicate check are
  // properties of the whole set, and validating one field at a time is exactly
  // how two concurrent single-field additions slip past a cap.
  listMetadataFields(kbId: string): Promise<MetadataFieldDecl[]>;
  replaceMetadataFields(kbId: string, fields: MetadataFieldDecl[]): Promise<MetadataFieldDecl[]>;
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
  private meta = new Map<string, MetadataFieldDecl[]>();

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
      defaultVerifier: null as string | null,
      defaultVerifyIntervalDays: null as number | null,
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

  async listMetadataFields(kbId: string): Promise<MetadataFieldDecl[]> {
    return [...(this.meta.get(kbId) ?? [])];
  }
  async replaceMetadataFields(kbId: string, fields: MetadataFieldDecl[]): Promise<MetadataFieldDecl[]> {
    this.meta.set(kbId, [...fields]);
    return [...fields];
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
