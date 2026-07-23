import type {
  KbStore,
  CreateKbInput,
  UpdateKbInput,
  KnowledgeBaseRow,
} from "./store";
import type { OwnerType, PublishState } from "./ownership";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed KbStore over the karda_kb schema. Used when DATABASE_URL is set;
// @prisma/client loads lazily via getPrismaClient(). Only the subset of columns
// the port exposes is read or written - the row carries far more, but the store
// deliberately does not surface immutable/lineage columns as mutable.

type PrismaKbRow = {
  id: string;
  workspaceId: string;
  ownerType: string;
  ownerSub: string | null;
  name: string;
  description: string | null;
  publishState: string;
  processingTemplateId: string | null;
  governanceEnabled: boolean;
  exemptSyncedContent: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toRow(r: PrismaKbRow): KnowledgeBaseRow {
  return {
    id: r.id,
    workspaceId: r.workspaceId,
    ownerType: r.ownerType as OwnerType,
    ownerSub: r.ownerSub,
    name: r.name,
    description: r.description,
    publishState: r.publishState as PublishState,
    processingTemplateId: r.processingTemplateId,
    governanceEnabled: r.governanceEnabled,
    exemptSyncedContent: r.exemptSyncedContent,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export class PrismaKbStore implements KbStore {
  async createKb(input: CreateKbInput): Promise<KnowledgeBaseRow> {
    const p = await getPrismaClient();
    const r = await p.knowledgeBase.create({
      data: {
        workspaceId: input.workspaceId,
        ownerType: input.ownerType,
        ownerSub: input.ownerSub,
        name: input.name,
        description: input.description ?? null,
        processingTemplateId: input.processingTemplateId ?? null,
      },
    });
    return toRow(r);
  }

  async getKb(id: string): Promise<KnowledgeBaseRow | null> {
    const p = await getPrismaClient();
    const r = await p.knowledgeBase.findFirst({ where: { id, deletedAt: null } });
    return r ? toRow(r) : null;
  }

  async listKbs(workspaceId: string): Promise<KnowledgeBaseRow[]> {
    const p = await getPrismaClient();
    const rows = await p.knowledgeBase.findMany({
      where: { workspaceId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toRow);
  }

  async updateKb(id: string, patch: UpdateKbInput): Promise<KnowledgeBaseRow | null> {
    const p = await getPrismaClient();
    // updateMany scoped by deletedAt: null so a soft-deleted row is not resurrected.
    const res = await p.knowledgeBase.updateMany({
      where: { id, deletedAt: null },
      data: { ...patch, updatedAt: new Date() },
    });
    if (res.count === 0) return null;
    return this.getKb(id);
  }

  async softDeleteKb(id: string): Promise<boolean> {
    const p = await getPrismaClient();
    const res = await p.knowledgeBase.updateMany({
      where: { id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return res.count > 0;
  }

  async nameTaken(workspaceId: string, name: string, exceptId?: string): Promise<boolean> {
    const p = await getPrismaClient();
    const n = await p.knowledgeBase.count({
      where: { workspaceId, name, deletedAt: null, id: exceptId ? { not: exceptId } : undefined },
    });
    return n > 0;
  }
}
