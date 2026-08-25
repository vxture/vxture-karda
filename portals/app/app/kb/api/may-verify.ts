import { actorForKb } from "./actor";
import type { AuthUser } from "../../auth/lib/claims";
import type { KnowledgeBaseRow } from "../lib/store";

// Who may verify. Governance is a DISTINCT authority from ownership: the
// library's assigned verifier may verify, and so may an admin/owner - but a
// plain member cannot, even in their own workspace.
//
// Shared rather than copied because three surfaces ask the same question (a
// document verify, an entry verify, and the work queue deciding whether to offer
// the control at all). Two copies of an authorization rule is one copy waiting
// to drift, and the drift is silent in the direction that matters.
export function mayVerify(user: AuthUser & { activeWorkspace: string }, kb: KnowledgeBaseRow): boolean {
  const actor = actorForKb(user, {
    ownerType: kb.ownerType,
    ownerSub: kb.ownerSub,
    workspaceId: kb.workspaceId,
    publishState: kb.publishState,
  });
  if (actor.role === "owner" || actor.role === "ws_admin" || actor.role === "org_admin") return true;
  return kb.defaultVerifier != null && kb.defaultVerifier === user.sub;
}
