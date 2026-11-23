import type { AuthUser } from "../auth/lib/claims";
import { getEntitlementResolver } from "../entitlement/resolver";
import { hasProductAccess } from "../entitlement/types";
import { productAssigned } from "./access";
import { userPlatformContext } from "./user-context";

/** Platform-admitted users have baseline member use without a governance role.
 * Keep raw roles unchanged; management remains explicitly authorized. */
export async function userAdmission(user: AuthUser, deps = {
  context: userPlatformContext,
  assigned: productAssigned,
  entitlement: (context: Awaited<ReturnType<typeof userPlatformContext>>) =>
    getEntitlementResolver().resolve(context.workspaceId, context),
}) {
  if (user.accountStatus && user.accountStatus !== "active") return { allowed: false as const, error: "inactive_account" };
  const context = await deps.context(user);
  if (!await deps.assigned(context)) return { allowed: false as const, error: "product_unassigned" };
  const entitlement = await deps.entitlement(context);
  return { allowed: hasProductAccess(entitlement), entitlement, error: "subscription_required" };
}
