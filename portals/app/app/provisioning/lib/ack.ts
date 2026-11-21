import { getProvisioningStore } from "./store";
import { platformRequest, workspacePlatformContext } from "../../platform/client";
interface Dependencies {
  current: (ws: string) => Promise<{ status: string; seq: number } | null>;
  report: (ws: string, body: string) => Promise<Response>;
}
const defaults: Dependencies = {
  current: async ws => {
    const store = getProvisioningStore();
    return store.atomic(ws, `ack-check:${ws}`, async tx => {
      const instance = await tx.instance(ws, "karda");
      return instance ? { status: instance.status, seq: await tx.getLastSeq(ws, "karda") } : null;
    });
  },
  report: async (ws, body) => platformRequest("/provisioning/ack", await workspacePlatformContext(ws), {
    method: "POST", headers: { "Content-Type": "application/json" }, body }),
};
export async function acknowledgeProvisioning(ws: string, seq: number, deliveryId?: string, deps = defaults): Promise<void> {
  const state = await deps.current(ws);
  if (!state || state.status !== "provisioned" || state.seq !== seq) return;
  const response = await deps.report(ws, JSON.stringify({ workspace_id: ws, product: "karda", status: "ready",
    ...(deliveryId ? { delivery_id: deliveryId } : {}), detail: { seq } }));
  if (!response.ok) throw new Error(`provisioning_ack_${response.status}`);
  const body = await response.json();
  if (body?.workspace_id !== ws || body.product !== "karda" || typeof body.replayed !== "boolean"
    || typeof body.acked_at !== "string" || !Number.isFinite(Date.parse(body.acked_at))) throw new Error("provisioning_ack_invalid");
  // Current platform ACK does not atomically bind version. detail.seq is evidence
  // only; upstream issue720 tracks the remaining in-flight race.
}
