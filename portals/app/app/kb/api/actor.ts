// Map the platform session (AuthUser) onto karda's product-level Actor, per KB.
//
// This mapping is the seam between two role systems that section 6.4 of the
// product definition insists must never be conflated: the token carries PLATFORM
// governance roles (scope-prefixed, e.g. workspace:owner / workspace:manager),
// while karda's authorization is about a SPECIFIC library - whose "owner" is the
// user whose sub matches the library's owner_sub, not anyone the token calls an
// owner.
//
// So "owner" is resolved against the row, and only the admin roles come from the
// token. Getting this backwards - treating a workspace:owner as the library's
// owner - would let any workspace admin edit any user's private library as if
// they wrote it, which is exactly the write-vs-visibility distinction KD-003
// turns on.
import type { AuthUser } from "../../auth/lib/claims";
import { isWorkspaceOwner, canManageWorkspace } from "../../auth/lib/claims";
import type { Actor, KbOwnership } from "../lib/ownership";

/**
 * Resolve the acting role FOR A GIVEN LIBRARY. The same user is `owner` of the
 * library they personally own and `ws_admin` elsewhere, so the actor cannot be
 * computed from the token alone - it needs the library's ownership row.
 */
export function actorForKb(user: AuthUser, kb: KbOwnership): Actor {
  // Personal ownership wins: if this user owns this user-tier library, they act
  // as its owner regardless of any admin role they also hold.
  if (kb.ownerType === "user" && kb.ownerSub === user.sub) {
    return { role: "owner", sub: user.sub };
  }
  // org_admin: a workspace owner is the org-wide administrator baseline
  // (080-rp: workspace:owner is the super-admin for everything under it).
  if (isWorkspaceOwner(user.roles)) return { role: "org_admin" };
  // ws_admin: manages members/roles/settings in the workspace.
  if (canManageWorkspace(user.roles)) return { role: "ws_admin" };
  return { role: "member" };
}

/**
 * The actor to use for CREATE, where there is no library yet. A creator owns
 * what they create (definition 4.8: create auto-attaches at the creation site),
 * so a user creating their own U-tier library acts as its owner.
 */
export function creatorActor(user: AuthUser): Actor {
  return { role: "owner", sub: user.sub };
}

export { isWorkspaceOwner, canManageWorkspace };
