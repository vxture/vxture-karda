import { createHash } from "node:crypto";
import type { ProvisioningStore } from "./store";
export interface ProvisioningEvent {
  id: string;
  type: string;
  occurred_at?: number;
  seq?: number;
  workspace_id: string;
  tenant_id?: string;
  application: string;
  plan?: string | null;
  data?: unknown;
}
export interface HandleResult { ok: true; handled: boolean; reason: "wrong-product" | "duplicate" | "stale" | "processed" | "ignored" }
export interface HandlerDeps {
  store: ProvisioningStore;
  product: string;
  onSubscriptionChanged?: (workspaceId: string) => void;
  onProvisioned?: (workspaceId: string) => Promise<void> | void;
}
export function eventHash(value: unknown): string {
  function stable(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(stable);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, val]) => [k, stable(val)]));
    return v;
  }
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
export async function handleProvisioning(event: ProvisioningEvent, deps: HandlerDeps): Promise<HandleResult> {
  if (event.application !== deps.product) return { ok: true, handled: false, reason: "wrong-product" };
  const lifecycle = event.type === "tenant.provisioned" || event.type === "tenant.deprovisioned";
  if (lifecycle && (!Number.isSafeInteger(event.seq) || event.seq! < 1)) throw new Error("lifecycle_version_required");
  const hash = eventHash(event);
  const result = await deps.store.atomic(event.workspace_id, event.id, async store => {
    const receipt = await store.delivered(event.id);
    if (receipt) {
      // Legacy receipts lack a signed payload binding; do not claim a match.
      if (receipt.payloadHash !== hash) throw new Error("provisioning_delivery_conflict");
      return { ok: true as const, handled: false, reason: "duplicate" as const };
    }
    let reason: HandleResult["reason"] = "processed";
    if (lifecycle) {
      const last = await store.getLastSeq(event.workspace_id, deps.product);
      if (event.seq! <= last) reason = "stale";
      else {
        await store.upsertInstance(event.workspace_id, deps.product,
          event.type === "tenant.provisioned" ? "provisioned" : "deprovisioned", event.tenant_id);
        // No remote side effects inside this transaction. Hook must be reentrant.
        if (event.type === "tenant.provisioned") await deps.onProvisioned?.(event.workspace_id);
        await store.setSeq(event.workspace_id, deps.product, event.seq!);
      }
    } else if (event.type !== "subscription_changed" && event.type !== "grant.invalidated") reason = "ignored";
    await store.markDelivered(event.id, { type: event.type, result: reason, payloadHash: hash });
    return { ok: true as const, handled: reason === "processed", reason };
  });
  // Including duplicate retries repairs a crash between commit and eviction.
  deps.onSubscriptionChanged?.(event.workspace_id);
  return result;
}
