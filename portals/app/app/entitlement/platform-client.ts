import { BRAND } from "@karda/shared/brand";
import { assertInternalTarget } from "../lib/internal-target";
import { EMPTY_ENTITLEMENT, type Entitlement, type QuotaPool } from "./types";
import { getOidcConfig } from "../auth/lib/config";
import { platformRequest, workspacePlatformContext } from "../platform/client";
import type { PlatformContext } from "../platform/ticket";
import { TIERS } from "@vxture/shared";

// C2 caller (product_200 section 3, product_220 section 3). Calls the platform
// entitlement endpoint with a verified scoped Bearer ticket and validates scope.
// Scope and authorization fields are mandatory. Unknown additive fields are
// ignored. No service credential is returned to the browser.

export interface PlatformClientConfig {
  baseUrl: string;
  product: string;
}

export function getPlatformClientConfig(): PlatformClientConfig | null {
  const baseUrl = process.env.PLATFORM_API_URL;
  if (!baseUrl || !getOidcConfig().clientSecret) return null;
  return { baseUrl, product: BRAND.productCode };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

/** Tolerant envelope parse: coerce known fields, ignore unknown, default missing. */
export function parseEntitlementEnvelope(
  workspaceId: string,
  product: string,
  raw: unknown,
): Entitlement {
  const o = (raw ?? {}) as Record<string, unknown>;
  const limits: Record<string, number> = {};
  if (o.limits && typeof o.limits === "object") {
    for (const [k, v] of Object.entries(o.limits as Record<string, unknown>)) {
      if (typeof v === "number" && Number.isFinite(v)) limits[k] = v;
      if (v === "unlimited") limits[k] = -1;
    }
  }
  const pools: QuotaPool[] = Array.isArray(o.quota_pools)
    ? (o.quota_pools as unknown[]).flatMap((p) => {
        const pp = p as Record<string, unknown>;
        const metric = str(pp.metric);
        return metric
          ? [{ metric, limit: num(pp.limit), remaining: num(pp.remaining), priority: num(pp.priority) }]
          : [];
      })
    : [];
  return {
    ...EMPTY_ENTITLEMENT,
    workspace_id: workspaceId,
    product,
    // status kept as-is (may be an unknown future value; gating uses tier/bundled)
    status: (str(o.status) as Entitlement["status"]) ?? null,
    trial_ends_at: str(o.trial_ends_at),
    current_period_end: str(o.current_period_end),
    cancel_at_period_end: o.cancel_at_period_end === true,
    data_retention_until: str(o.data_retention_until),
    tier: (str(o.tier) as Entitlement["tier"]) ?? null,
    bundled: o.bundled === true,
    limits,
    quota_pools: pools,
  };
}

export async function fetchEntitlement(
  cfg: PlatformClientConfig,
  workspaceId: string,
  userContext?: PlatformContext,
): Promise<Entitlement> {
  assertInternalTarget(cfg.baseUrl);
  const context = userContext ?? await workspacePlatformContext(workspaceId);
  if (context.workspaceId !== workspaceId) throw new Error("entitlement_context_mismatch");
  const res = await platformRequest(`/platform/entitlements?workspace_id=${encodeURIComponent(workspaceId)}&product=${encodeURIComponent(cfg.product)}`,
    context, {}, cfg.baseUrl);
  if (!res.ok) throw new Error(`entitlement endpoint ${res.status}`);
  const body: unknown = await res.json();
  validateEntitlementScope(body, workspaceId, cfg.product);
  return parseEntitlementEnvelope(workspaceId, cfg.product, body);
}

export function validateEntitlementScope(raw: unknown, workspaceId: string, product: string): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("entitlement_invalid");
  const body = raw as Record<string, unknown>;
  if (body.workspace_id !== workspaceId || body.product !== product
    || !Object.hasOwn(body, "status") || (body.status !== null && typeof body.status !== "string")
    || !Object.hasOwn(body, "tier") || (body.tier !== null && !(TIERS as readonly unknown[]).includes(body.tier))
    || typeof body.bundled !== "boolean") throw new Error("entitlement_scope_invalid");
  if (body.limits != null && (typeof body.limits !== "object" || Array.isArray(body.limits)
    || Object.values(body.limits).some(v => v !== null && v !== "unlimited"
      && !(typeof v === "number" && Number.isFinite(v) && (v === -1 || v >= 0))))) throw new Error("entitlement_limits_invalid");
  if (body.quota_pools != null && (!Array.isArray(body.quota_pools) || body.quota_pools.some(pool => !pool
    || typeof pool.metric !== "string" || !Number.isFinite(pool.limit) || pool.limit < 0
    || !Number.isFinite(pool.remaining)))) throw new Error("entitlement_pools_invalid");
}
