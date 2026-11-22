import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { platformRequest, workspacePlatformContext } from "../../platform/client";
import { fetchEntitlement, getPlatformClientConfig } from "../../entitlement/platform-client";
import { hasDataAccess, type Entitlement } from "../../entitlement/types";
import { CapacityError } from "../lib/capacity";

const metric = "storage.bytes";
export async function storageLock(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
  const key = `karda:capacity:${metric}:${workspaceId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}

/** Caller holds the workspace storage lock. Includes retained legacy references. */
export async function retainedBytes(tx: Prisma.TransactionClient, workspaceId: string): Promise<bigint> {
  const rows = await tx.storedObject.findMany({ where: { workspaceId, state: { not: "deleted" } } });
  let used = rows.reduce((sum, row) => sum + row.sizeBytes, 0n);
  const tracked = new Set(rows.map(row => row.objectKey));
  const legacy = await tx.document.groupBy({ by: ["storageRef"],
    where: { knowledgeBase: { workspaceId }, storageRef: { not: null } },
    _max: { sizeBytes: true }, _min: { sizeBytes: true }, _count: { _all: true, sizeBytes: true } });
  for (const row of legacy) {
    if (!row.storageRef || tracked.has(row.storageRef)) continue;
    if (row._max.sizeBytes === null || row._min.sizeBytes! < 0n || row._count.sizeBytes !== row._count._all) {
      throw new CapacityError("capacity_unavailable", metric);
    }
    used += row._max.sizeBytes;
  }
  return used;
}

/** Durable snapshot outbox, committed with byte reservations/deletion. */
export async function queueGauge(tx: Prisma.TransactionClient, workspaceId: string, value: bigint): Promise<void> {
  // Database clock plus last durable observation gives strict ordering across
  // replicas, equal-millisecond writes and application clock corrections.
  await tx.$executeRaw`INSERT INTO karda_kb.storage_watermark
    (workspace_id, value, observed_at, pending, attempts, retry_at)
    VALUES (${workspaceId}::uuid, ${value}, date_trunc('milliseconds', clock_timestamp()), true, 0, now())
    ON CONFLICT (workspace_id) DO UPDATE SET value = EXCLUDED.value,
      observed_at = GREATEST(EXCLUDED.observed_at, karda_kb.storage_watermark.observed_at + interval '1 millisecond'),
      pending = true, attempts = 0, retry_at = now()`;
}

export function storageHeadroom(e: Entitlement): bigint {
  if (!hasDataAccess(e)) throw new CapacityError("capacity_unavailable", metric);
  const pools = e.quota_pools.filter(pool => pool.metric === metric);
  if (!pools.length) throw new CapacityError("capacity_unconfigured", metric);
  return pools.reduce((sum, pool) => {
    if (!Number.isSafeInteger(pool.remaining)) throw new CapacityError("capacity_unavailable", metric);
    return sum + BigInt(pool.remaining);
  }, 0n);
}

export interface GaugeTransport {
  prepare?(workspaceId: string): Promise<void>;
  report(workspaceId: string, value: bigint, observedAt: Date): Promise<void>;
  remaining(workspaceId: string): Promise<bigint>;
}

export function validateGaugeReceipt(raw: unknown, workspaceId: string, value: bigint, observedAt: Date): void {
  const body = raw as Record<string, unknown> | null;
  // A replay may be applied:false, but it must return this EXACT snapshot.
  // A newer foreign snapshot is not evidence that this ledger is synchronized.
  if (!body || body.workspace_id !== workspaceId || body.product !== "karda" || body.metric !== metric
    || typeof body.applied !== "boolean" || body.value !== value.toString()
    || typeof body.observed_at !== "string" || new Date(body.observed_at).getTime() !== observedAt.getTime()) {
    throw new CapacityError("capacity_unavailable", metric);
  }
}

function platformGauge(): GaugeTransport {
  const contexts = new Map<string, Awaited<ReturnType<typeof workspacePlatformContext>>>();
  return {
  async prepare(workspaceId) {
    contexts.set(workspaceId, await workspacePlatformContext(workspaceId));
  },
  async report(workspaceId, value, observedAt) {
    const context = contexts.get(workspaceId);
    if (!context) throw new CapacityError("capacity_unavailable", metric);
    const response = await platformRequest("/usage/gauge", context, { method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: workspaceId, product: "karda", metric,
        value: value.toString(), observed_at: observedAt.toISOString() }) });
    if (!response.ok) throw new CapacityError("capacity_unavailable", metric);
    validateGaugeReceipt(await response.json(), workspaceId, value, observedAt);
  },
  async remaining(workspaceId) {
    const cfg = getPlatformClientConfig();
    if (!cfg) throw new CapacityError("capacity_unavailable", metric);
    // No resolver cache: shared headroom must follow the acknowledged baseline.
    const context = contexts.get(workspaceId);
    if (!context) throw new CapacityError("capacity_unavailable", metric);
    return storageHeadroom(await fetchEntitlement(cfg, workspaceId, context));
  },
  };
}

export class StorageGauge {
  private inventoryCursor: string | null = null;
  constructor(private readonly transport: GaugeTransport = platformGauge()) {}

  /** Caller holds the storage lock; snapshot must already be DURABLY queued. */
  async flushLocked(tx: Prisma.TransactionClient, workspaceId: string): Promise<void> {
    const snapshot = await tx.storageWatermark.findUnique({ where: { workspaceId } });
    if (!snapshot) throw new CapacityError("capacity_unavailable", metric);
    if (!snapshot.pending) return;
    await this.transport.report(workspaceId, snapshot.value, snapshot.observedAt);
    await tx.storageWatermark.update({ where: { workspaceId }, data: { pending: false, attempts: 0 } });
  }

  async admit(tx: Prisma.TransactionClient, workspaceId: string, added: bigint): Promise<void> {
    try {
      await this.flushLocked(tx, workspaceId);
      if (added > await this.transport.remaining(workspaceId)) throw new CapacityError("capacity_exceeded", metric);
    } catch (error) {
      throw new CapacityError(error instanceof CapacityError ? error.code : "capacity_unavailable", metric);
    }
  }

  async baseline(workspaceId: string): Promise<void> {
    // Resolve immutable tenant anchors BEFORE taking a transaction connection:
    // waiting writers must not exhaust the pool while the lock owner needs it.
    await this.transport.prepare?.(workspaceId);
    const db = await getPrismaClient();
    await db.$transaction(async tx => {
      await storageLock(tx, workspaceId);
      await queueGauge(tx, workspaceId, await retainedBytes(tx, workspaceId));
    });
  }

  async flush(workspaceId: string): Promise<void> {
    const db = await getPrismaClient();
    try {
      await this.transport.prepare?.(workspaceId);
      await db.$transaction(async tx => {
        await storageLock(tx, workspaceId);
        await this.flushLocked(tx, workspaceId);
      }, { maxWait: 5_000, timeout: 20_000 });
    } catch {
      // No transaction rollback erases the already committed pending snapshot.
      await db.storageWatermark.updateMany({ where: { workspaceId, pending: true }, data: {
        attempts: { increment: 1 }, retryAt: new Date(Date.now() + 60_000) } });
      throw new CapacityError("capacity_unavailable", metric);
    }
  }

  async retry(batchSize = 20): Promise<void> {
    const db = await getPrismaClient();
    const due = await db.storageWatermark.findMany({ where: { pending: true, attempts: { lt: 10 }, retryAt: { lte: new Date() } },
      orderBy: { retryAt: "asc" }, take: batchSize });
    for (const row of due) {
      try { await this.flush(row.workspaceId); }
      catch { console.error("[storage/gauge] snapshot retained for retry/operator recovery"); }
    }
  }

  /** Bootstrap retained legacy inventories even without a subsequent upload. */
  async seedMissing(batchSize = 20): Promise<void> {
    const db = await getPrismaClient();
    const rows = await db.$queryRaw<Array<{ workspace_id: string }>>`SELECT a.workspace_id
      FROM vx_provision.provision_anchor a
      LEFT JOIN karda_kb.storage_watermark w ON w.workspace_id = a.workspace_id
      WHERE a.product_code = 'karda' AND w.workspace_id IS NULL
        AND (${this.inventoryCursor}::uuid IS NULL OR a.workspace_id > ${this.inventoryCursor}::uuid)
      ORDER BY a.workspace_id LIMIT ${batchSize}`;
    if (!rows.length) { this.inventoryCursor = null; return; }
    for (const row of rows) {
      this.inventoryCursor = row.workspace_id;
      try { await this.baseline(row.workspace_id); }
      catch { console.error("[storage/gauge] legacy inventory requires recovery"); }
    }
  }
}
