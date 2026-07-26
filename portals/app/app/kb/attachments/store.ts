// Persistence port for kb_attachment (9b) - a user's per-product library
// attachment list (definition 4.8). A working-set link, not an authorization
// surface: a row means "this user has this library attached for this product".
// Insert/delete only, and attach is idempotent (the unique key absorbs a re-attach).
import { prismaEnabled, getPrismaClient } from "../../lib/db";

/** The composite identity of one attachment. */
export interface AttachKey {
  workspaceId: string;
  userSub: string;
  productCode: string;
  kbId: string;
}

export interface AttachmentStore {
  /** Idempotent: attaching an already-attached library is a no-op. */
  attach(key: AttachKey): Promise<void>;
  /** Returns true if a row was removed. */
  detach(key: AttachKey): Promise<boolean>;
  isAttached(key: AttachKey): Promise<boolean>;
  /** The library ids this (workspace, user, product) has attached. */
  listKbIds(workspaceId: string, userSub: string, productCode: string): Promise<string[]>;
}

// --- in-memory ---------------------------------------------------------------

const keyOf = (k: AttachKey) => `${k.workspaceId}|${k.userSub}|${k.productCode}|${k.kbId}`;

export class InMemoryAttachmentStore implements AttachmentStore {
  private rows = new Map<string, AttachKey>();

  async attach(key: AttachKey): Promise<void> {
    this.rows.set(keyOf(key), { ...key });
  }
  async detach(key: AttachKey): Promise<boolean> {
    return this.rows.delete(keyOf(key));
  }
  async isAttached(key: AttachKey): Promise<boolean> {
    return this.rows.has(keyOf(key));
  }
  async listKbIds(workspaceId: string, userSub: string, productCode: string): Promise<string[]> {
    return [...this.rows.values()]
      .filter((r) => r.workspaceId === workspaceId && r.userSub === userSub && r.productCode === productCode)
      .map((r) => r.kbId);
  }
}

// --- Prisma ------------------------------------------------------------------

export class PrismaAttachmentStore implements AttachmentStore {
  async attach(key: AttachKey): Promise<void> {
    const p = await getPrismaClient();
    // Idempotent via the unique key - a re-attach is silently skipped.
    await p.kbAttachment.createMany({
      data: [{ workspaceId: key.workspaceId, userSub: key.userSub, productCode: key.productCode, kbId: key.kbId }],
      skipDuplicates: true,
    });
  }
  async detach(key: AttachKey): Promise<boolean> {
    const p = await getPrismaClient();
    const res = await p.kbAttachment.deleteMany({
      where: { workspaceId: key.workspaceId, userSub: key.userSub, productCode: key.productCode, kbId: key.kbId },
    });
    return res.count > 0;
  }
  async isAttached(key: AttachKey): Promise<boolean> {
    const p = await getPrismaClient();
    return (
      (await p.kbAttachment.count({
        where: { workspaceId: key.workspaceId, userSub: key.userSub, productCode: key.productCode, kbId: key.kbId },
      })) > 0
    );
  }
  async listKbIds(workspaceId: string, userSub: string, productCode: string): Promise<string[]> {
    const p = await getPrismaClient();
    const rows = await p.kbAttachment.findMany({
      where: { workspaceId, userSub, productCode },
      select: { kbId: true },
    });
    return rows.map((r: { kbId: string }) => r.kbId);
  }
}

export function getAttachmentStore(): AttachmentStore {
  return prismaEnabled() ? new PrismaAttachmentStore() : new InMemoryAttachmentStore();
}
