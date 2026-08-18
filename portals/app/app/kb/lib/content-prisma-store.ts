import type {
  ContentStore,
  FolderRow,
  DocumentRow,
  EntryRow,
  CreateDocumentInput,
  CreateEntryInput,
  DocumentSource,
  VerificationPatch,
  DueItem,
} from "./content-store";
import type { ContentState, VerificationState } from "./state";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed ContentStore over karda_kb. Only the columns the port exposes
// are touched; the state transitions the DB cannot express (e.g. that `failed`
// carries a reason) are the service's job, this layer just writes what it is
// told. Deletes are soft (content_state='deleted') so lineage survives the audit
// window (100-kb-model 5.1) - a hard DELETE would drop the source_ref history.

/* eslint-disable @typescript-eslint/no-explicit-any */
function toFolder(r: any): FolderRow {
  return { id: r.id, kbId: r.kbId, name: r.name, createdAt: r.createdAt, updatedAt: r.updatedAt };
}
function toDoc(r: any): DocumentRow {
  return {
    id: r.id,
    kbId: r.kbId,
    folderId: r.folderId,
    title: r.title,
    source: r.source as DocumentSource,
    connectorCode: r.connectorCode,
    sourceRef: (r.sourceRef ?? null) as Record<string, unknown> | null,
    contentHash: r.contentHash,
    storageRef: r.storageRef,
    mime: r.mime,
    sizeBytes: r.sizeBytes === null || r.sizeBytes === undefined ? null : Number(r.sizeBytes),
    contentState: r.contentState as ContentState,
    failureReason: r.failureReason,
    verificationState: r.verificationState as VerificationState,
    verifier: r.verifier ?? null,
    verifiedAt: r.verifiedAt ?? null,
    expiresAt: r.expiresAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
function toEntry(r: any): EntryRow {
  return {
    id: r.id,
    kbId: r.kbId,
    folderId: r.folderId,
    title: r.title,
    contentTemplateId: r.contentTemplateId,
    templateVersion: r.templateVersion,
    fields: (r.fields ?? {}) as Record<string, unknown>,
    contentState: r.contentState as ContentState,
    verificationState: r.verificationState as VerificationState,
    verifier: r.verifier ?? null,
    verifiedAt: r.verifiedAt ?? null,
    expiresAt: r.expiresAt ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class PrismaContentStore implements ContentStore {
  async createFolder(kbId: string, name: string): Promise<FolderRow> {
    const p = await getPrismaClient();
    return toFolder(await p.folder.create({ data: { kbId, name } }));
  }
  async listFolders(kbId: string): Promise<FolderRow[]> {
    const p = await getPrismaClient();
    return (await p.folder.findMany({ where: { kbId }, orderBy: { name: "asc" } })).map(toFolder);
  }
  async folderNameTaken(kbId: string, name: string, exceptId?: string): Promise<boolean> {
    const p = await getPrismaClient();
    return (
      (await p.folder.count({
        where: { kbId, name, id: exceptId ? { not: exceptId } : undefined },
      })) > 0
    );
  }
  async deleteFolder(id: string): Promise<boolean> {
    const p = await getPrismaClient();
    // documents/entries keep folder_id via ON DELETE SET NULL (they are not
    // orphaned, just unfiled), so a folder delete is a plain delete.
    const r = await p.folder.deleteMany({ where: { id } });
    return r.count > 0;
  }

  async createDocument(input: CreateDocumentInput): Promise<DocumentRow> {
    const p = await getPrismaClient();
    return toDoc(
      await p.document.create({
        data: {
          kbId: input.kbId,
          folderId: input.folderId ?? null,
          title: input.title,
          source: input.source,
          connectorCode: input.connectorCode ?? null,
          sourceRef: (input.sourceRef ?? undefined) as object | undefined,
          contentHash: input.contentHash ?? null,
          storageRef: input.storageRef ?? null,
          mime: input.mime ?? null,
          sizeBytes: input.sizeBytes ?? null,
          createdInProduct: input.createdInProduct ?? null,
          createdBy: input.createdBy ?? null,
        },
      }),
    );
  }
  async getDocument(id: string): Promise<DocumentRow | null> {
    const p = await getPrismaClient();
    const r = await p.document.findFirst({ where: { id, contentState: { not: "deleted" } } });
    return r ? toDoc(r) : null;
  }
  async listDocuments(kbId: string): Promise<DocumentRow[]> {
    const p = await getPrismaClient();
    const rows = await p.document.findMany({
      where: { kbId, contentState: { not: "deleted" } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toDoc);
  }
  async setDocumentState(
    id: string,
    state: ContentState,
    failureReason: string | null = null,
  ): Promise<DocumentRow | null> {
    const p = await getPrismaClient();
    const res = await p.document.updateMany({
      where: { id, contentState: { not: "deleted" } },
      data: {
        contentState: state,
        failureReason: state === "failed" ? failureReason : null,
        failedAt: state === "failed" ? new Date() : null,
        updatedAt: new Date(),
      },
    });
    if (res.count === 0) return null;
    const p2 = await getPrismaClient();
    const r = await p2.document.findUnique({ where: { id } });
    return r ? toDoc(r) : null;
  }
  async documentExists(
    kbId: string,
    source: DocumentSource,
    connectorCode: string | null,
    contentHash: string,
  ): Promise<boolean> {
    const p = await getPrismaClient();
    return (
      (await p.document.count({
        where: {
          kbId,
          source,
          connectorCode: connectorCode ?? null,
          contentHash,
          contentState: { not: "deleted" },
        },
      })) > 0
    );
  }
  async findLiveConnectorDocument(kbId: string, connectorCode: string, sourceDocId: string): Promise<DocumentRow | null> {
    const p = await getPrismaClient();
    const r = await p.document.findFirst({
      where: {
        kbId,
        source: "connector",
        connectorCode,
        contentState: { not: "deleted" },
        sourceRef: { path: ["source_doc_id"], equals: sourceDocId },
      },
    });
    return r ? toDoc(r) : null;
  }
  async listLiveConnectorDocsByBinding(kbId: string, bindingId: string): Promise<DocumentRow[]> {
    const p = await getPrismaClient();
    const rows = await p.document.findMany({
      where: {
        kbId,
        source: "connector",
        contentState: { not: "deleted" },
        sourceRef: { path: ["binding_id"], equals: bindingId },
      },
    });
    return rows.map(toDoc);
  }

  async createEntry(input: CreateEntryInput): Promise<EntryRow> {
    const p = await getPrismaClient();
    return toEntry(
      await p.entry.create({
        data: {
          kbId: input.kbId,
          folderId: input.folderId ?? null,
          title: input.title ?? null,
          contentTemplateId: input.contentTemplateId,
          templateVersion: input.templateVersion,
          fields: input.fields as object,
          createdInProduct: input.createdInProduct ?? null,
          createdBy: input.createdBy ?? null,
        },
      }),
    );
  }
  async getEntry(id: string): Promise<EntryRow | null> {
    const p = await getPrismaClient();
    const r = await p.entry.findFirst({ where: { id, contentState: { not: "deleted" } } });
    return r ? toEntry(r) : null;
  }
  async listEntries(kbId: string): Promise<EntryRow[]> {
    const p = await getPrismaClient();
    const rows = await p.entry.findMany({
      where: { kbId, contentState: { not: "deleted" } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map(toEntry);
  }
  async updateEntryFields(id: string, fields: Record<string, unknown>): Promise<EntryRow | null> {
    const p = await getPrismaClient();
    const res = await p.entry.updateMany({
      where: { id, contentState: { not: "deleted" } },
      data: { fields: fields as object, updatedAt: new Date() },
    });
    if (res.count === 0) return null;
    return this.getEntry(id);
  }
  async setEntryState(id: string, state: ContentState): Promise<EntryRow | null> {
    const p = await getPrismaClient();
    const res = await p.entry.updateMany({
      where: { id, contentState: { not: "deleted" } },
      data: { contentState: state, updatedAt: new Date() },
    });
    if (res.count === 0) return null;
    const p2 = await getPrismaClient();
    const r = await p2.entry.findUnique({ where: { id } });
    return r ? toEntry(r) : null;
  }

  async setDocumentVerification(id: string, patch: VerificationPatch): Promise<DocumentRow | null> {
    const p = await getPrismaClient();
    const res = await p.document.updateMany({
      where: { id, contentState: { not: "deleted" } },
      data: {
        verificationState: patch.verificationState,
        verifier: patch.verifier,
        verifiedAt: patch.verifiedAt,
        expiresAt: patch.expiresAt,
        updatedAt: new Date(),
      },
    });
    if (res.count === 0) return null;
    return this.getDocument(id);
  }
  async setEntryVerification(id: string, patch: VerificationPatch): Promise<EntryRow | null> {
    const p = await getPrismaClient();
    const res = await p.entry.updateMany({
      where: { id, contentState: { not: "deleted" } },
      data: {
        verificationState: patch.verificationState,
        verifier: patch.verifier,
        verifiedAt: patch.verifiedAt,
        expiresAt: patch.expiresAt,
        updatedAt: new Date(),
      },
    });
    if (res.count === 0) return null;
    return this.getEntry(id);
  }
  async dueForStale(now: Date, limit: number): Promise<DueItem[]> {
    const p = await getPrismaClient();
    const where = { verificationState: "verified", expiresAt: { lte: now }, contentState: { not: "deleted" } };
    const [docs, entries] = await Promise.all([
      p.document.findMany({ where, select: { id: true, kbId: true }, take: limit, orderBy: { expiresAt: "asc" } }),
      p.entry.findMany({ where, select: { id: true, kbId: true }, take: limit, orderBy: { expiresAt: "asc" } }),
    ]);
    const out: DueItem[] = [
      ...docs.map((d: { id: string; kbId: string }) => ({ kind: "document" as const, id: d.id, kbId: d.kbId })),
      ...entries.map((e: { id: string; kbId: string }) => ({ kind: "entry" as const, id: e.id, kbId: e.kbId })),
    ];
    return out.slice(0, limit);
  }
}
