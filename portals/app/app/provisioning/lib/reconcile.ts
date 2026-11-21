import { publishWorkspaceRevision } from "../../events/outbox";
import { getProvisioningReadClient } from "../../platform/provisioning-read";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { getProvisioningStore, type ProvisioningStore } from "./store";
import { acknowledgeProvisioning } from "./ack";
export interface ProvisioningItem {
  workspace_id: string; tenant_id: string; state: "pending" | "provisioned" | "deprovisioned";
  seq: number; updated_at: string;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function parsePage(raw: unknown): { items: ProvisioningItem[]; nextCursor: string | null } {
  const value = raw as { items?: unknown; nextCursor?: unknown } | null;
  if (!value || !Array.isArray(value.items) || value.items.length > 200
    || !(value.nextCursor === null || typeof value.nextCursor === "string" && /^[A-Za-z0-9_-]{1,512}$/.test(value.nextCursor))) throw new Error("provisioning_page_invalid");
  for (const item of value.items) {
    if (!item || typeof item !== "object" || !uuid.test(item.workspace_id) || !uuid.test(item.tenant_id)
      || !["pending", "provisioned", "deprovisioned"].includes(item.state)
      || !Number.isSafeInteger(item.seq) || item.seq < (item.state === "pending" ? 0 : 1)
      || typeof item.updated_at !== "string" || !Number.isFinite(Date.parse(item.updated_at))) throw new Error("provisioning_item_invalid");
  }
  return { items: value.items as ProvisioningItem[], nextCursor: value.nextCursor as string | null };
}
export async function applySnapshot(item: ProvisioningItem, store: ProvisioningStore = getProvisioningStore()): Promise<void> {
  if (item.state === "pending") return;
  await store.atomic(item.workspace_id, `reconcile:${item.workspace_id}`, async tx => {
    const last = await tx.getLastSeq(item.workspace_id, "karda");
    if (last > item.seq) return;
    const current = await tx.instance(item.workspace_id, "karda");
    if (last === item.seq && current && current.status !== item.state) throw new Error("provisioning_snapshot_conflict");
    // Equal-version reads may restore a missing historical tenant anchor. They
    // never overwrite a newer lifecycle or change an established tenant.
    await tx.upsertInstance(item.workspace_id, "karda", item.state, item.tenant_id);
    if (last < item.seq) {
      await tx.setSeq(item.workspace_id, "karda", item.seq);
      await tx.touchAccess(item.workspace_id);
    }
  });
}
interface Dependencies { page: (cursor?: string) => Promise<unknown>; apply: (item: ProvisioningItem) => Promise<void> }
export async function reconcileProvisioning(deps?: Dependencies) {
  const client = deps ? null : getProvisioningReadClient();
  const source = deps ?? { page: (cursor?: string) => client!.page(cursor), apply: async (item: ProvisioningItem) => {
    await applySnapshot(item);
    getEntitlementResolver().invalidate(item.workspace_id);
    await publishWorkspaceRevision(item.workspace_id);
    if (item.state === "provisioned") await acknowledgeProvisioning(item.workspace_id, item.seq);
  } };
  let cursor: string | undefined, pages = 0, scanned = 0, failed = 0;
  const seen = new Set<string>();
  for (;;) {
    const page = parsePage(await source.page(cursor));
    for (const item of page.items) {
      if (item.state !== "pending") { try { await source.apply(item); } catch { failed++; } }
      scanned++;
    }
    pages++;
    if (page.nextCursor === null) return { pages, scanned, failed };
    if (pages >= 1000 || seen.has(page.nextCursor)) throw new Error("provisioning_cursor_loop");
    seen.add(page.nextCursor); cursor = page.nextCursor;
  }
}
let started = false;
export function startProvisioningReconciliation(): void {
  if (started) return;
  started = true;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const readOnly = process.env.DEPLOY_STAGE !== "production";
      const client = readOnly ? getProvisioningReadClient() : null;
      const result = await reconcileProvisioning(readOnly ? { page: cursor => client!.page(cursor), apply: async () => {} } : undefined);
      console.info("[provisioning/reconcile]", { ...result, readOnly });
    } catch { console.error("[provisioning/reconcile] unavailable; retry scheduled"); }
    finally { running = false; }
  };
  setTimeout(() => { void tick(); }, 1000).unref();
  setInterval(() => { void tick(); }, 300000).unref();
}
