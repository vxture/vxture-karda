import type { Prisma } from "@prisma/client";
import type { ProvisioningStore, DeliveryMeta } from "./store";
import { getPrismaClient } from "../../lib/db";
export class PrismaProvisioningStore implements ProvisioningStore {
  constructor(private tx?: Prisma.TransactionClient) {}
  private async client() { return this.tx ?? await getPrismaClient(); }
  async atomic<T>(workspaceId: string, deliveryId: string, fn: (store: ProvisioningStore) => Promise<T>): Promise<T> {
    if (this.tx) throw new Error("nested_provisioning_transaction");
    return (await getPrismaClient()).$transaction(async tx => {
      // Delivery lock binds reuse across workspaces; workspace lock serializes
      // before the first watermark exists. Reconciliation takes the same lock.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`karda:delivery:${deliveryId}`}, 0))`;
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`karda:provision:${workspaceId}`}, 0))`;
      return fn(new PrismaProvisioningStore(tx));
    }, { timeout: 15000 });
  }
  async instance(workspaceId: string, product: string) {
    return (await this.client()).appInstance.findUnique({ where: {
      workspaceId_productCode: { workspaceId, productCode: product } } });
  }
  async touchAccess(workspaceId: string) {
    await (await this.client()).accessRevision.upsert({ where: { workspaceId },
      create: { workspaceId }, update: { generation: { increment: 1 }, updatedAt: new Date() } });
  }
  async delivered(id: string): Promise<DeliveryMeta | null> {
    const row = await (await this.client()).webhookDelivery.findUnique({ where: { deliveryId: id } });
    return row ? { type: row.type, result: row.result, payloadHash: row.payloadHash ?? undefined } : null;
  }
  async isDelivered(id: string) { return Boolean(await this.delivered(id)); }
  async markDelivered(id: string, meta?: DeliveryMeta) {
    await (await this.client()).webhookDelivery.create({ data: { deliveryId: id,
      type: meta?.type ?? "unknown", result: meta?.result ?? "processed", payloadHash: meta?.payloadHash } });
  }
  async getLastSeq(workspaceId: string, product: string) {
    const row = await (await this.client()).provisionSeq.findUnique({
      where: { workspaceId_productCode: { workspaceId, productCode: product } } });
    return row ? Number(row.lastSeq) : -1;
  }
  async setSeq(workspaceId: string, product: string, seq: number) {
    await (await this.client()).provisionSeq.upsert({
      where: { workspaceId_productCode: { workspaceId, productCode: product } },
      create: { workspaceId, productCode: product, lastSeq: BigInt(seq) },
      update: { lastSeq: BigInt(seq), updatedAt: new Date() } });
  }
  async upsertInstance(workspaceId: string, product: string, status: string, tenantId?: string) {
    if (!tenantId) throw new Error("provisioning_tenant_required");
    const p = await this.client();
    const key = { workspaceId_productCode: { workspaceId, productCode: product } };
    const existing = await p.appInstance.findUnique({ where: key });
    const anchor = await p.provisionAnchor.findUnique({ where: key });
    if ((existing?.tenantId && existing.tenantId !== tenantId) || (anchor && anchor.tenantId !== tenantId)) {
      throw new Error("provisioning_tenant_conflict");
    }
    // Existing reference keys are immutable. A dedicated immutable anchor can
    // recover old NULL tenant_id rows without widening UPDATE privileges.
    if (!anchor) await p.provisionAnchor.create({ data: { workspaceId, productCode: product, tenantId } });
    const env = process.env.DEPLOY_STAGE === "beta" ? "beta" : "prod";
    if (existing && existing.env !== env) throw new Error("provisioning_environment_conflict");
    await p.appInstance.upsert({ where: key,
      create: { workspaceId, productCode: product, tenantId, status, env,
        provisionedAt: status === "provisioned" ? new Date() : null },
      update: { status, updatedAt: new Date(),
        ...(status === "provisioned" && !existing?.provisionedAt ? { provisionedAt: new Date() } : {}) } });
  }
}
