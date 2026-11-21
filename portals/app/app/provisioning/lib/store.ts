// Persistence port. Lifecycle state, watermark and receipt commit together.
import { prismaEnabled } from "../../lib/db";
import { isDeployedStage } from "../../lib/deploy-stage";
import { PrismaProvisioningStore } from "./prisma-store";
export interface DeliveryMeta { type: string; result: string; payloadHash?: string }
export interface ProvisioningStore {
  atomic<T>(workspaceId: string, deliveryId: string, fn: (store: ProvisioningStore) => Promise<T>): Promise<T>;
  touchAccess(workspaceId: string): Promise<void>;
  delivered(deliveryId: string): Promise<DeliveryMeta | null>;
  instance(workspaceId: string, product: string): Promise<{ status: string; tenantId?: string | null } | null>;
  isDelivered(deliveryId: string): Promise<boolean>;
  markDelivered(deliveryId: string, meta?: DeliveryMeta): Promise<void>;
  getLastSeq(workspaceId: string, product: string): Promise<number>;
  setSeq(workspaceId: string, product: string, seq: number): Promise<void>;
  upsertInstance(workspaceId: string, product: string, status: string, tenantId?: string): Promise<void>;
}
export class InMemoryProvisioningStore implements ProvisioningStore {
  private revisions = new Map<string, number>();
  private deliveries = new Map<string, DeliveryMeta>();
  private seq = new Map<string, number>();
  private instances = new Map<string, { status: string; tenantId?: string }>();
  private queue: Promise<unknown> = Promise.resolve();
  async atomic<T>(_ws: string, _id: string, fn: (store: ProvisioningStore) => Promise<T>): Promise<T> {
    const work = this.queue.then(async () => {
      const snapshot = [new Map(this.deliveries), new Map(this.seq), new Map(this.instances), new Map(this.revisions)] as const;
      try { return await fn(this); }
      catch (error) { [this.deliveries, this.seq, this.instances, this.revisions] = snapshot; throw error; }
    });
    this.queue = work.catch(() => {});
    return work;
  }
  private key(w: string, p: string) { return JSON.stringify([w, p]); }
  async instance(w: string, p: string) { return this.instances.get(this.key(w, p)) ?? null; }
  async touchAccess(ws: string) { this.revisions.set(ws, (this.revisions.get(ws) ?? 0) + 1); }
  async delivered(id: string) { return this.deliveries.get(id) ?? null; }
  async isDelivered(id: string) { return this.deliveries.has(id); }
  async markDelivered(id: string, meta: DeliveryMeta = { type: "unknown", result: "processed" }) { this.deliveries.set(id, meta); }
  async getLastSeq(w: string, p: string) { return this.seq.get(this.key(w, p)) ?? -1; }
  async setSeq(w: string, p: string, seq: number) { this.seq.set(this.key(w, p), seq); }
  async upsertInstance(w: string, p: string, status: string, tenantId?: string) {
    const key = this.key(w, p), previous = this.instances.get(key);
    if (previous?.tenantId && tenantId && previous.tenantId !== tenantId) throw new Error("provisioning_tenant_conflict");
    this.instances.set(key, { status, tenantId: previous?.tenantId ?? tenantId });
  }
}
let override: ProvisioningStore | null = null;
let memo: ProvisioningStore | null = null;
export function getProvisioningStore(): ProvisioningStore {
  if (override) return override;
  if (memo) return memo;
  if (!prismaEnabled() && isDeployedStage()) throw new Error("provisioning_database_required");
  return memo = prismaEnabled() ? new PrismaProvisioningStore() : new InMemoryProvisioningStore();
}
export function setProvisioningStore(next: ProvisioningStore | null): void { override = next; memo = null; }
