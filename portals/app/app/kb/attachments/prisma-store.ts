// Prisma-backed AttachmentStore over karda_kb.kb_attachment. Used when
// DATABASE_URL is set; @prisma/client loads lazily via getPrismaClient(). Split
// from the port file (store.ts) to match the repo's store layout - port +
// in-memory + factory live in store.ts, the Prisma impl sits here.
import type { AttachmentStore, AttachKey } from "./store";
import { getPrismaClient } from "../../lib/db";

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
