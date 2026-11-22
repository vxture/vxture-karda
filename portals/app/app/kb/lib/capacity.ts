import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { isDeployedStage } from "../../lib/deploy-stage";
import { getPlatformClientConfig } from "../../entitlement/platform-client";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { hasDataAccess, type Entitlement } from "../../entitlement/types";
import { workspacePlatformContext } from "../../platform/client";

export type CapacityCode = "capacity_exceeded" | "capacity_unconfigured" | "capacity_unavailable";
export class CapacityError extends Error {
  constructor(readonly code: CapacityCode, readonly metric = "kb.max") {
    super(code);
  }
}
export type CapacityMetric = "kb.max" | "document.max" | "binding.max" | "storage.bytes";
export type CapacityLimitSource = (workspaceId: string, metric: CapacityMetric) => Promise<number | undefined>;

export function validateCapacityLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isSafeInteger(limit) || limit < -1) {
    throw new CapacityError("capacity_unconfigured");
  }
  return limit;
}

/** New offers omit the retired content-count axis. Explicit legacy caps still
 * apply; absence of any other cap remains a configuration failure. */
export function entitlementCapacityLimit(entitlement: Entitlement, metric: CapacityMetric): number | undefined {
  if (!hasDataAccess(entitlement)) throw new CapacityError("capacity_unavailable", metric);
  if (metric === "document.max" && !Object.prototype.hasOwnProperty.call(entitlement.limits, metric)) return -1;
  return entitlement.limits[metric];
}

export async function platformLimit(workspaceId: string, metric: CapacityMetric): Promise<number | undefined> {
  // The existing offline database/dev path has no commercial envelope. Never
  // apply this exemption on a deployed stage, even with ALLOW_MOCK_ON_DEPLOY.
  if (!isDeployedStage() && !getPlatformClientConfig()) return -1;
  const context = await workspacePlatformContext(workspaceId);
  const entitlement = await getEntitlementResolver().resolve(workspaceId, context);
  return entitlementCapacityLimit(entitlement, metric);
}

/** Serialize count + insertion across replicas, not only within one process. */
export async function createWithinLibraryCapacity<T>(
  workspaceId: string,
  create: (tx: Prisma.TransactionClient) => Promise<T>,
  limitSource?: CapacityLimitSource,
): Promise<T> {
  return createWithinCapacity(workspaceId, "kb.max", create, limitSource);
}

export async function createWithinCapacity<T>(
  workspaceId: string,
  metric: CapacityMetric,
  create: (tx: Prisma.TransactionClient) => Promise<T>,
  limitSource: CapacityLimitSource = platformLimit,
  prepare?: (tx: Prisma.TransactionClient) => Promise<void>,
): Promise<T> {
  let limit: number;
  try { limit = validateCapacityLimit(await limitSource(workspaceId, metric)); }
  catch (error) {
    throw new CapacityError(error instanceof CapacityError ? error.code : "capacity_unavailable", metric);
  }
  const db = await getPrismaClient();
  return db.$transaction(async tx => {
    const lockKey = `karda:capacity:${metric}:${workspaceId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    if (prepare) await prepare(tx);
    // READ COMMITTED counts AFTER a preceding writer releases its lock.
    // Paused bindings and archived content retain slots; terminal deletion or
    // revocation releases them. Entries share the document capacity pool.
    const kb = { workspaceId, deletedAt: null };
    const current = metric === "kb.max" ? await tx.knowledgeBase.count({ where: kb })
      : metric === "binding.max" ? await tx.binding.count({ where: { knowledgeBase: kb, state: { not: "revoked" } } })
      : await tx.document.count({ where: { knowledgeBase: kb, contentState: { not: "deleted" } } })
        + await tx.entry.count({ where: { knowledgeBase: kb, contentState: { not: "deleted" } } });
    if (limit !== -1 && current >= limit) throw new CapacityError("capacity_exceeded", metric);
    return create(tx);
  }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 10_000 });
}

export async function capacityWorkspace(kbId: string, metric: CapacityMetric): Promise<string> {
  const db = await getPrismaClient();
  const kb = await db.knowledgeBase.findFirst({ where: { id: kbId, deletedAt: null }, select: { workspaceId: true } });
  if (!kb) throw new CapacityError("capacity_unavailable", metric);
  return kb.workspaceId;
}
