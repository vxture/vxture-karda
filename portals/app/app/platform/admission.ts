import type { AuthUser } from "../auth/lib/claims";
import { getEntitlementResolver } from "../entitlement/resolver";
import { hasProductAccess } from "../entitlement/types";
import { productAssigned } from "./access";
import { userPlatformContext } from "./user-context";

export async function userAdmission(user: AuthUser) {
  if (user.accountStatus && user.accountStatus !== "active") return { allowed: false as const, error: "inactive_account" };
  const context = await userPlatformContext(user);
  if (!await productAssigned(context)) return { allowed: false as const, error: "product_unassigned" };
  const entitlement = await getEntitlementResolver().resolve(context.workspaceId, context);
  return { allowed: hasProductAccess(entitlement), entitlement, error: "subscription_required" };
}
