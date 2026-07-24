import { test } from "node:test";
import assert from "node:assert/strict";
import { actorForKb, creatorActor } from "./actor";
import type { AuthUser } from "../../auth/lib/claims";
import type { KbOwnership } from "../lib/ownership";

const user = (over: Partial<AuthUser> = {}): AuthUser => ({
  sub: "usr_a",
  activeOrg: "org_1",
  activeOrgType: "organization",
  activeWorkspace: "ws_1",
  roles: [],
  accountStatus: "active",
  canManage: false,
  isWorkspaceOwner: false,
  ...over,
});

const kb = (over: Partial<KbOwnership> = {}): KbOwnership => ({
  ownerType: "user",
  ownerSub: "usr_a",
  workspaceId: "ws_1",
  publishState: "private",
  ...over,
});

test("the library's owner is resolved from the row, not the token", () => {
  // usr_a owns this user-tier library -> owner, regardless of platform roles.
  assert.deepEqual(actorForKb(user(), kb()), { role: "owner", sub: "usr_a" });
});

test("a different user is NOT the owner even with a workspace admin role", () => {
  // This is the crux of section 6.4: a workspace admin editing usr_a's private
  // library must act as ws_admin, never as its owner - otherwise write-vs-
  // visibility (KD-003) collapses.
  const admin = user({ sub: "usr_b", roles: ["workspace:manager"], canManage: true });
  assert.deepEqual(actorForKb(admin, kb({ ownerSub: "usr_a" })), { role: "ws_admin" });
});

test("personal ownership beats an admin role held by the same user", () => {
  // If the owner also happens to be a workspace owner, acting on THEIR OWN
  // library they are still the owner - ownership is the stronger, more specific
  // claim.
  const ownerWhoIsAlsoAdmin = user({ sub: "usr_a", roles: ["workspace:owner"], isWorkspaceOwner: true });
  assert.deepEqual(actorForKb(ownerWhoIsAlsoAdmin, kb({ ownerSub: "usr_a" })), {
    role: "owner",
    sub: "usr_a",
  });
});

test("workspace:owner maps to org_admin on someone else's library", () => {
  const wsOwner = user({ sub: "usr_b", roles: ["workspace:owner"], isWorkspaceOwner: true });
  assert.deepEqual(actorForKb(wsOwner, kb({ ownerSub: "usr_a" })), { role: "org_admin" });
});

test("a plain member is a member", () => {
  const m = user({ sub: "usr_c" });
  assert.deepEqual(actorForKb(m, kb({ ownerSub: "usr_a" })), { role: "member" });
});

test("nobody is the owner of an institutional (platform/tenant/product) library", () => {
  for (const ownerType of ["platform", "tenant", "product"] as const) {
    const wsOwner = user({ sub: "usr_a", roles: ["workspace:owner"], isWorkspaceOwner: true });
    const actor = actorForKb(wsOwner, kb({ ownerType, ownerSub: null }));
    assert.notEqual(actor.role, "owner", `${ownerType} library must not have a personal owner`);
  }
});

test("a creator acts as owner of what they create", () => {
  assert.deepEqual(creatorActor(user({ sub: "usr_x" })), { role: "owner", sub: "usr_x" });
});
