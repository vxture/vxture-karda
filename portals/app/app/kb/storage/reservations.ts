import { randomUUID, createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { ObjectStore, StoredObject } from "./objectstore";
import { getPrismaClient } from "../../lib/db";
import { CapacityError, validateCapacityLimit, type CapacityLimitSource } from "../lib/capacity";
import { StorageGauge, storageLock as lock, retainedBytes, queueGauge } from "./gauge";

const GRACE_MS = 60 * 60 * 1000;
const metric = "storage.bytes";
const safe = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, "_");
function keyFor(ws: string, namespace: string, hash: string): string {
  return `${safe(ws)}/${safe(namespace)}/${hash.slice(0, 2)}/${hash}`;
}

/** Guards metadata commits against cleanup; caller holds this lock until commit. */
export async function assertStoredReference(tx: Prisma.TransactionClient, workspaceId: string, kbId: string,
  key: string, bytes: number | null | undefined): Promise<void> {
  await lock(tx, workspaceId);
  const stored = await tx.storedObject.findUnique({ where: { objectKey: key } });
  if (!stored || stored.state !== "ready" || stored.workspaceId !== workspaceId || stored.kbId !== kbId
    || bytes == null || !Number.isSafeInteger(bytes) || BigInt(bytes) !== stored.sizeBytes) {
    throw new CapacityError("capacity_unavailable", metric);
  }
}

/** Durable reservations wrap the raw filesystem/OSS adapter, before any PUT. */
export class ReservedObjectStore implements ObjectStore {
  constructor(private readonly raw: ObjectStore, private readonly limits?: CapacityLimitSource,
    private readonly gauge = new StorageGauge()) {}

  async put(workspaceId: string, kbId: string, bytes: Buffer): Promise<StoredObject> {
    let limit = -1;
    try {
      if (this.limits) limit = validateCapacityLimit(await this.limits(workspaceId, metric));
      else await this.gauge.baseline(workspaceId);
    }
    catch (error) { throw new CapacityError(error instanceof CapacityError ? error.code : "capacity_unavailable", metric); }
    const db = await getPrismaClient(), hash = createHash("sha256").update(bytes).digest("hex");
    const reserved = await db.$transaction(async tx => {
      await lock(tx, workspaceId);
      const kb = await tx.knowledgeBase.findFirst({ where: { id: kbId, workspaceId, deletedAt: null } });
      if (!kb) throw new CapacityError("capacity_unavailable", metric);
      const rows = await tx.storedObject.findMany({ where: { workspaceId, state: { not: "deleted" } } });
      const same = rows.find(r => r.kbId === kbId && r.contentHash === hash && r.state === "ready");
      if (same) {
        if (same.sizeBytes !== BigInt(bytes.length)) throw new CapacityError("capacity_unavailable", metric);
        await tx.storedObject.update({ where: { id: same.id }, data: { retainUntil: new Date(Date.now() + GRACE_MS) } });
        return { row: same, reused: true };
      }
      // Never take over an uncertain PUT. A delayed writer has no lease-based
      // permission to overwrite another generation; each generation has its own key.
      if (rows.some(r => r.kbId === kbId && r.contentHash === hash && r.state === "pending")) {
        throw new CapacityError("capacity_unavailable", metric);
      }
      const used = await retainedBytes(tx, workspaceId);
      if (!this.limits) await this.gauge.admit(tx, workspaceId, BigInt(bytes.length));
      if (limit !== -1 && used + BigInt(bytes.length) > BigInt(limit)) throw new CapacityError("capacity_exceeded", metric);
      const id = randomUUID(), namespace = `${kbId}_${id}`;
      const row = await tx.storedObject.create({ data: { id, workspaceId, kbId, contentHash: hash,
        objectKey: keyFor(workspaceId, namespace, hash), sizeBytes: BigInt(bytes.length),
        retainUntil: new Date(Date.now() + GRACE_MS) } });
      if (!this.limits) await queueGauge(tx, workspaceId, used + BigInt(bytes.length));
      return { row, reused: false };
    }, { maxWait: 5_000, timeout: 30_000 });
    const row = reserved.row;
    if (!this.limits) await this.gauge.flush(workspaceId);
    if (!reserved.reused) {
      // Keep reservation on failure/timeout: a PUT may have reached remote storage.
      const stored = await this.raw.put(workspaceId, `${kbId}_${row.id}`, bytes);
      if (stored.key !== row.objectKey || stored.sizeBytes !== bytes.length || stored.contentHash !== hash) {
        throw new CapacityError("capacity_unavailable", metric);
      }
      await db.storedObject.updateMany({ where: { id: row.id, state: "pending" },
        data: { state: "ready", retainUntil: new Date(Date.now() + GRACE_MS), updatedAt: new Date() } });
    }
    return { key: row.objectKey, sizeBytes: Number(row.sizeBytes), contentHash: row.contentHash };
  }
  get(key: string): Promise<Buffer | null> { return this.raw.get(key); }
  async delete(): Promise<boolean> {
    // Metadata retention is distinct from physical deletion. Only the reference-
    // checked recovery path may delete a tracked object and release capacity.
    throw new Error("storage_delete_requires_reconciliation");
  }

  async recover(batchSize = 20): Promise<{ recovered: number; deleted: number; retained: number }> {
    const db = await getPrismaClient(), now = new Date();
    const rows = await db.storedObject.findMany({ where: { state: { in: ["pending", "ready", "deleting"] },
      retainUntil: { lt: now }, retryAt: { lte: now }, attempts: { lt: 10 } },
      orderBy: { retryAt: "asc" }, take: batchSize });
    const result = { recovered: 0, deleted: 0, retained: 0 };
    for (const row of rows) {
      try {
        if (row.state === "pending") {
          const bytes = await this.raw.get(row.objectKey);
          // An absent result cannot prove no late writer. Retain unknown PUTs;
          // never free their bytes or issue a delete based only on elapsed time.
          const valid = bytes !== null && BigInt(bytes.length) === row.sizeBytes
            && createHash("sha256").update(bytes).digest("hex") === row.contentHash;
          await db.storedObject.updateMany({ where: { id: row.id, state: "pending" }, data: {
            ...(valid ? { state: "ready", retainUntil: new Date(Date.now() + GRACE_MS) } : {}),
            attempts: { increment: 1 }, retryAt: new Date(Date.now() + GRACE_MS), updatedAt: new Date(),
          } });
          if (valid) result.recovered++; else result.retained++;
          continue;
        }
        const claimed = await db.$transaction(async tx => {
          await lock(tx, row.workspaceId);
          const current = await tx.storedObject.findUniqueOrThrow({ where: { id: row.id } });
          if (current.state === "deleted" || current.state === "pending" || current.retainUntil >= new Date()) return false;
          // Includes soft-deleted documents and deleted libraries: preserve all
          // retained references until a separately reviewed retention purge.
          const visualRefs=await tx.$queryRawUnsafe<{n:number}[]>("SELECT count(*)::integer AS n FROM karda_kb.visual_asset WHERE image_ref=$1",row.objectKey);
          if (await tx.document.count({ where: { storageRef: row.objectKey } }) || visualRefs[0].n>0) {
            await tx.storedObject.update({ where: { id: row.id }, data: { retryAt: new Date(Date.now() + GRACE_MS) } });
            return false;
          }
          await tx.storedObject.update({ where: { id: row.id }, data: { state: "deleting", updatedAt: new Date() } });
          return true;
        });
        if (!claimed) { result.retained++; continue; }
        // Once deleting, no metadata commit or new PUT may reuse this generation.
        // Duplicate cleanup is safe because this key will never be recreated.
        const removed = await this.raw.delete(row.objectKey);
        if (!removed && await this.raw.get(row.objectKey) !== null) throw new Error("storage_delete_unconfirmed");
        await db.$transaction(async tx => {
          await lock(tx, row.workspaceId);
          await tx.storedObject.updateMany({ where: { id: row.id, state: "deleting" }, data: { state: "deleted", updatedAt: new Date() } });
          if (!this.limits) await queueGauge(tx, row.workspaceId, await retainedBytes(tx, row.workspaceId));
        });
        result.deleted++;
      } catch {
        await db.storedObject.updateMany({ where: { id: row.id, state: { not: "deleted" } },
          data: { attempts: { increment: 1 }, retryAt: new Date(Date.now() + GRACE_MS), updatedAt: new Date() } });
        result.retained++;
      }
    }
    return result;
  }
}
