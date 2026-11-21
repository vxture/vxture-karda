import { getUsageStore, type UsageRow, type UsageStore } from "./store";
import { getPlatformClientConfig } from "../../entitlement/platform-client";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { platformRequest, workspacePlatformContext } from "../../platform/client";
import { isDeployedStage } from "../../lib/deploy-stage";
export interface ConsumeResult { status: number; body?: unknown }
export type ConsumeFn = (row: UsageRow) => Promise<ConsumeResult>;
export interface FlushOptions { store?: UsageStore; consume?: ConsumeFn; onGated?: (ws: string) => void; batchSize?: number }
export interface FlushSummary { scanned: number; flushed: number; gated: number; retried: number; skipped?: boolean }
export function parseReceipt(result: ConsumeResult): { gated: boolean } {
  if (result.status !== 200) throw new Error(`usage_report_http_${result.status}`);
  const body = result.body as Record<string, unknown> | null;
  if (!body || typeof body !== "object" || Array.isArray(body)
    || typeof body.consumed !== "number" || !Number.isFinite(body.consumed) || body.consumed < 0
    || typeof body.remaining_total !== "number" || !Number.isFinite(body.remaining_total)
    || body.gated !== undefined && typeof body.gated !== "boolean"
    || body.event_id !== undefined && (typeof body.event_id !== "string" || !body.event_id)) throw new Error("usage_report_invalid_receipt");
  return { gated: body.gated === true };
}
export async function flushUsage(opts: FlushOptions = {}): Promise<FlushSummary> {
  const store = opts.store ?? getUsageStore();
  const consume = opts.consume ?? defaultConsume();
  if (!consume) {
    if (isDeployedStage()) throw new Error("usage_platform_unconfigured");
    return { scanned: 0, flushed: 0, gated: 0, retried: 0, skipped: true };
  }
  const rows = await store.unflushed(opts.batchSize ?? 50);
  const summary = { scanned: rows.length, flushed: 0, gated: 0, retried: 0 };
  for (const row of rows) {
    let gated: boolean;
    try { gated = parseReceipt(await consume(row)).gated; }
    catch (error) {
      await store.failed(row.idempotencyKey, error instanceof Error ? error.message : "usage_report_failed");
      summary.retried++; continue;
    }
    // Persistence errors propagate; unchanged idempotency keys recover safely.
    await store.markFlushed([row.idempotencyKey]);
    if (gated) {
      summary.gated++;
      (opts.onGated ?? ((ws: string) => getEntitlementResolver().invalidate(ws)))(row.workspaceId);
    } else summary.flushed++;
  }
  return summary;
}
function defaultConsume(): ConsumeFn | null {
  const cfg = getPlatformClientConfig();
  if (!cfg) return null;
  return async row => {
    const response = await platformRequest("/usage/consume", await workspacePlatformContext(row.workspaceId), {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace_id: row.workspaceId, product: cfg.product, metric: row.metric,
        amount: row.amount, idempotency_key: row.idempotencyKey, intent: "report" }),
    }, cfg.baseUrl);
    return { status: response.status, body: await response.json().catch(() => null) };
  };
}
