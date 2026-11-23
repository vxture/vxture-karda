import { resolveProductAccess } from "../authz/store";
import { permits } from "../authz/policy";
import type { AuthUser } from "../auth/lib/claims";
import { getEntitlementResolver } from "../entitlement/resolver";
import { hasProductAccess } from "../entitlement/types";
import { productAssigned } from "./access";
import { userPlatformContext } from "./user-context";

/** Platform eligibility precedes explicit local role/permission evaluation. */
export async function userAdmission(user: AuthUser, deps = {
  context: userPlatformContext,
  access: resolveProductAccess,
  assigned: productAssigned,
  entitlement: (context: Awaited<ReturnType<typeof userPlatformContext>>) =>
    getEntitlementResolver().resolve(context.workspaceId, context),
}) {
  if (user.accountStatus && user.accountStatus !== "active") return { allowed: false as const, error: "inactive_account" };
  const context = await deps.context(user);
  if (!await deps.assigned(context)) return { allowed: false as const, error: "product_unassigned" };
  const entitlement = await deps.entitlement(context);
  if (!hasProductAccess(entitlement)) return { allowed: false as const, entitlement, error: "subscription_required" };
  const productAccess = await deps.access({ workspaceId: context.workspaceId, sub: user.sub, roles: user.roles });
  return { allowed: permits(productAccess,"product.enter"), entitlement, productAccess, error: "role_required" };
}
