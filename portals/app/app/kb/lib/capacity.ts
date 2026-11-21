import type { Prisma } from "@prisma/client";
import { getPrismaClient } from "../../lib/db";
import { isDeployedStage } from "../../lib/deploy-stage";
import { getPlatformClientConfig } from "../../entitlement/platform-client";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { hasDataAccess } from "../../entitlement/types";
import { workspacePlatformContext } from "../../platform/client";

export type CapacityCode = "capacity_exceeded" | "capacity_unconfigured" | "capacity_unavailable";
export class CapacityError extends Error {
  constructor(readonly code: CapacityCode, readonly metric = "kb.max") {
    super(code);
  }
}
export type CapacityLimitSource = (workspaceId: string) => Promise<number | undefined>;

export function validateCapacityLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isSafeInteger(limit) || limit < -1) {
    throw new CapacityError("capacity_unconfigured");
  }
  return limit;
}

async function platformLibraryLimit(workspaceId: string): Promise<number | undefined> {
  // The existing offline database/dev path has no commercial envelope. Never
  // apply this exemption on a deployed stage, even with ALLOW_MOCK_ON_DEPLOY.
  if (!isDeployedStage() && !getPlatformClientConfig()) return -1;
  const context = await workspacePlatformContext(workspaceId);
  const entitlement = await getEntitlementResolver().resolve(workspaceId, context);
  if (!hasDataAccess(entitlement)) throw new CapacityError("capacity_unavailable");
  return entitlement.limits["kb.max"];
}

/** Serialize count + insertion across replicas, not only within one process. */
export async function createWithinLibraryCapacity<T>(
  workspaceId: string,
  create: (tx: Prisma.TransactionClient) => Promise<T>,
  limitSource: CapacityLimitSource = platformLibraryLimit,
): Promise<T> {
  let limit: number;
  try { limit = validateCapacityLimit(await limitSource(workspaceId)); }
  catch (error) {
    if (error instanceof CapacityError) throw error;
    throw new CapacityError("capacity_unavailable");
  }
  const db = await getPrismaClient();
  return db.$transaction(async tx => {
    const lockKey = `karda:capacity:kb.max:${workspaceId}`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`;
    // READ COMMITTED gives this query a fresh snapshot AFTER a preceding
    // writer commits and releases the transaction lock. Archived libraries
    // still occupy a slot; only soft deletion releases it.
    const current = await tx.knowledgeBase.count({ where: { workspaceId, deletedAt: null } });
    if (limit !== -1 && current >= limit) throw new CapacityError("capacity_exceeded");
    return create(tx);
  }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 10_000 });
}
