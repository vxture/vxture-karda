// Local usage buffer port (local_usage.raw). Only COUNTER metrics are buffered
// here; gauge is a no-buffer direct PUT and caps are counted locally. In-memory
// on the offline path; Prisma-backed over local_usage when DATABASE_URL is set.
import { isDeployedStage } from "../../lib/deploy-stage";
import { prismaEnabled } from "../../lib/db";
import { PrismaUsageStore } from "./prisma-store";

export interface UsageRow {
  workspaceId: string;
  metric: string; // must hit a platform metric registry key
  amount: number;
  idempotencyKey: string; // forced; replay = no-op
  flushed: boolean;
  attempts?: number;
}

export interface UsageStore {
  record(row: Omit<UsageRow, "flushed">): Promise<void>;
  unflushed(limit: number): Promise<UsageRow[]>;
  markFlushed(idempotencyKeys: string[]): Promise<void>;
  failed(key: string, error: string): Promise<void>;
}

export class InMemoryUsageStore implements UsageStore {
  private rows = new Map<string, UsageRow>();

  async record(row: Omit<UsageRow, "flushed">): Promise<void> {
    // Upsert by idempotency key: a replay must not double-count.
    const existing = this.rows.get(row.idempotencyKey);
    if (existing && (existing.workspaceId !== row.workspaceId || existing.metric !== row.metric || existing.amount !== row.amount)) throw new Error("usage_idempotency_conflict");
    if (!existing) {
      this.rows.set(row.idempotencyKey, { ...row, flushed: false });
    }
  }
  async unflushed(limit: number): Promise<UsageRow[]> {
    const out: UsageRow[] = [];
    for (const r of this.rows.values()) {
      if (!r.flushed) out.push(r);
      if (out.length >= limit) break;
    }
    return out;
  }
  async failed(key: string, _error: string): Promise<void> {
    const row = this.rows.get(key); if (row) row.attempts = (row.attempts ?? 0) + 1;
  }
  async markFlushed(keys: string[]): Promise<void> {
    for (const k of keys) {
      const r = this.rows.get(k);
      if (r) r.flushed = true;
    }
  }
}

let override: UsageStore | null = null;
let memo: UsageStore | null = null;

export function getUsageStore(): UsageStore {
  if (override) return override;
  if (memo) return memo;
  if (!prismaEnabled() && isDeployedStage()) throw new Error("usage_database_required");
  memo = prismaEnabled() ? new PrismaUsageStore() : new InMemoryUsageStore();
  return memo;
}
export function setUsageStore(next: UsageStore | null): void {
  override = next;
  memo = null;
}
