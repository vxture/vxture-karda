import type { UsageStore, UsageRow } from "./store";
import { getPrismaClient } from "../../lib/db";

// Prisma-backed UsageStore over local_usage.raw. Used when DATABASE_URL is set.

export class PrismaUsageStore implements UsageStore {
  async record(row: Omit<UsageRow, "flushed">): Promise<void> {
    const p = await getPrismaClient();
    // Upsert on the unique idempotency key; a replay is a no-op (empty update).
    const stored = await p.raw.upsert({
      where: { idempotencyKey: row.idempotencyKey },
      create: {
        workspaceId: row.workspaceId,
        metric: row.metric,
        amount: BigInt(row.amount),
        idempotencyKey: row.idempotencyKey,
      },
      update: {},
    });
    if (stored.workspaceId !== row.workspaceId || stored.metric !== row.metric || stored.amount !== BigInt(row.amount)) throw new Error("usage_idempotency_conflict");
  }

  async unflushed(limit: number): Promise<UsageRow[]> {
    const p = await getPrismaClient();
    const rows = await p.raw.findMany({ where: { flushed: false, attempts: { lt: 10 }, nextAttemptAt: { lte: new Date() } },
      orderBy: { createdAt: "asc" }, take: limit });
    return rows.map((r) => ({
      workspaceId: r.workspaceId,
      metric: r.metric,
      amount: Number(r.amount),
      idempotencyKey: r.idempotencyKey,
      flushed: r.flushed,
      attempts: r.attempts,
    }));
  }

  async failed(key: string, error: string): Promise<void> {
    const p = await getPrismaClient();
    const row = await p.raw.findUnique({ where: { idempotencyKey: key } });
    if (!row || row.flushed) return;
    if (row.attempts >= 9) console.error("[usage/flush] automatic retry limit reached; operator recovery required");
    const delay = Math.min(3600000, 30000 * 2 ** Math.min(row.attempts, 7));
    await p.raw.updateMany({ where: { idempotencyKey: key, flushed: false }, data: {
      attempts: { increment: 1 }, lastError: error.slice(0, 200), nextAttemptAt: new Date(Date.now() + delay) } });
  }
  async markFlushed(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    const p = await getPrismaClient();
    await p.raw.updateMany({ where: { idempotencyKey: { in: keys } }, data: { flushed: true, flushedAt: new Date(), lastError: null } });
  }
}
