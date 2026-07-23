// Ownership and publish-ladder rules for a KnowledgeBase (10-product-definition
// section 4, points 6-9; 100-kb-model section 3).
//
// The DB already enforces the two structural invariants (owner_type='user' iff
// owner_sub present; a unique name per workspace). What lives here is the
// BEHAVIOURAL half the schema cannot express: which publish transitions an actor
// is allowed to make, and by whose authority. Keeping it as pure predicates -
// no DB, no request context beyond a role - means the CRUD layer states intent
// ("owner publishes to workspace") and this module answers yes/no, rather than
// the rule being reimplemented inline at each call site where it can drift.

export const OWNER_TYPES = ["platform", "tenant", "user", "product"] as const;
export type OwnerType = (typeof OWNER_TYPES)[number];

// private -> ws_published (owner, to home WS) -> org_published (WS admin opens,
// or org admin force-opens). An owner may retract instantly. (definition 4.6)
export const PUBLISH_STATES = ["private", "ws_published", "org_published"] as const;
export type PublishState = (typeof PUBLISH_STATES)[number];

// Who is acting. These are function roles in the product's terms, resolved from
// the platform session upstream - this module does not read identity itself.
export type Actor =
  | { role: "owner"; sub: string }
  | { role: "ws_admin" }
  | { role: "org_admin" }
  | { role: "member" }; // any other authenticated member

export interface KbOwnership {
  ownerType: OwnerType;
  ownerSub: string | null;
  workspaceId: string;
  publishState: PublishState;
}

/** owner_type='user' iff owner_sub is set. Mirrors chk_kb_owner_sub so the app
 *  rejects the shape with a clear message before the DB rejects it opaquely. */
export function ownershipShapeValid(o: Pick<KbOwnership, "ownerType" | "ownerSub">): boolean {
  return (o.ownerType === "user") === (o.ownerSub != null);
}

/**
 * Is `actor` the owner of a user-owned KB? Only user-tier libraries have a
 * personal owner; platform/tenant/product libraries are owned institutionally
 * and have no `ownerSub` to match.
 */
export function isOwner(o: KbOwnership, actor: Actor): boolean {
  return actor.role === "owner" && o.ownerType === "user" && o.ownerSub === actor.sub;
}

export type PublishDecision = { allowed: true } | { allowed: false; reason: string };

/**
 * May `actor` move this KB from its current publish state to `target`?
 *
 * The ladder is not symmetric. Going UP the ladder is gated by role (owner
 * publishes to their workspace; only an admin opens org-wide). Coming DOWN -
 * retraction - is the owner's instant right and needs no admin, because the
 * whole point of the ladder is that exposure is the owner's to revoke
 * (definition 4.6). org_admin force-open is retained as an override.
 */
export function canPublish(
  o: KbOwnership,
  actor: Actor,
  target: PublishState,
): PublishDecision {
  if (target === o.publishState) return { allowed: true }; // idempotent no-op

  const owner = isOwner(o, actor);
  const rank = (s: PublishState) => PUBLISH_STATES.indexOf(s);
  const goingUp = rank(target) > rank(o.publishState);

  if (!goingUp) {
    // Retraction (any downward move). The owner may always retract; an admin
    // may also pull something back.
    if (owner || actor.role === "ws_admin" || actor.role === "org_admin") {
      return { allowed: true };
    }
    return { allowed: false, reason: "only the owner or an admin may retract" };
  }

  // Upward: target is strictly higher than current.
  switch (target) {
    case "ws_published":
      // Publishing to the home workspace is the owner's own act.
      return owner
        ? { allowed: true }
        : { allowed: false, reason: "only the owner may publish to the workspace" };
    case "org_published":
      // Opening org-wide is an admin act - the owner cannot self-promote past
      // their own workspace (definition 4.6: WS admin opens, or org admin
      // force-opens).
      return actor.role === "ws_admin" || actor.role === "org_admin"
        ? { allowed: true }
        : { allowed: false, reason: "only a WS or org admin may publish org-wide" };
    default:
      return { allowed: false, reason: "unreachable publish target" };
  }
}

/**
 * Transfer of a departed owner's user-tier library. Only the home WS admin may
 * do it, and only for a user-owned KB (definition 4.6: departure is handled by
 * the home WS admin via transfer).
 */
export function canTransferOwnership(o: KbOwnership, actor: Actor): PublishDecision {
  if (o.ownerType !== "user") {
    return { allowed: false, reason: "only user-tier libraries have a personal owner to transfer" };
  }
  return actor.role === "ws_admin"
    ? { allowed: true }
    : { allowed: false, reason: "only the home workspace admin may transfer ownership" };
}
