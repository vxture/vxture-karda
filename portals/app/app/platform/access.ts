import { platformRequest } from "./client";
import type { PlatformContext } from "./ticket";

export function parseProductAccess(value: unknown, context: PlatformContext): boolean {
  const body = value as Record<string, unknown> | null;
  if (!context.subject || !context.subjectToken || !body || typeof body.allowed !== "boolean"
    || body.product !== "karda" || body.subject !== context.subject
    || body.org_id !== context.orgId || body.workspace_id !== context.workspaceId) throw new Error("product_access_scope_invalid");
  return body.allowed;
}

export async function productAssigned(context: PlatformContext): Promise<boolean> {
  const response = await platformRequest("/platform/product-access", context);
  if (!response.ok) throw new Error(`product_access_${response.status}`);
  return parseProductAccess(await response.json(), context);
}
