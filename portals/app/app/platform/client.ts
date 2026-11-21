import { assertInternalTarget } from "../lib/internal-target";
import { getPlatformTicketSource, type PlatformContext } from "./ticket";

/** Background jobs use signed-event/reconciliation anchors, never request-body org IDs. */
export async function workspacePlatformContext(workspaceId: string): Promise<PlatformContext> {
  const { getPrismaClient } = await import("../lib/db");
  const instance = await (await getPrismaClient()).appInstance.findUnique({
    where: { workspaceId_productCode: { workspaceId, productCode: "karda" } },
    select: { tenantId: true },
  });
  if (!instance?.tenantId) throw new Error("workspace_platform_anchor_required");
  return { orgId: instance.tenantId, workspaceId };
}

export async function platformRequest(path: string, context: PlatformContext, init: RequestInit = {},
  baseUrl = process.env.PLATFORM_API_URL): Promise<Response> {
  if (!baseUrl) throw new Error("platform_api_unconfigured");
  assertInternalTarget(baseUrl);
  if (!path.startsWith("/") || path.startsWith("//")) throw new Error("invalid_platform_path");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await getPlatformTicketSource().tokenFor(context)}`);
  headers.set("Accept", "application/json");
  return fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, { ...init, headers,
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000) });
}
