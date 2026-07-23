import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ownershipShapeValid,
  isOwner,
  canPublish,
  canTransferOwnership,
  type KbOwnership,
  type Actor,
} from "./ownership";

const userKb = (publishState: KbOwnership["publishState"] = "private"): KbOwnership => ({
  ownerType: "user",
  ownerSub: "usr_a",
  workspaceId: "ws_1",
  publishState,
});

const owner: Actor = { role: "owner", sub: "usr_a" };
const otherOwner: Actor = { role: "owner", sub: "usr_b" };
const wsAdmin: Actor = { role: "ws_admin" };
const orgAdmin: Actor = { role: "org_admin" };
const member: Actor = { role: "member" };

test("ownership shape mirrors chk_kb_owner_sub", () => {
  assert.ok(ownershipShapeValid({ ownerType: "user", ownerSub: "usr_a" }));
  assert.ok(ownershipShapeValid({ ownerType: "platform", ownerSub: null }));
  assert.equal(ownershipShapeValid({ ownerType: "user", ownerSub: null }), false);
  assert.equal(ownershipShapeValid({ ownerType: "product", ownerSub: "x" }), false);
});

test("only the matching user is the owner; institutional libraries have none", () => {
  assert.ok(isOwner(userKb(), owner));
  assert.equal(isOwner(userKb(), otherOwner), false);
  const platformKb: KbOwnership = { ownerType: "platform", ownerSub: null, workspaceId: "ws_1", publishState: "org_published" };
  assert.equal(isOwner(platformKb, { role: "owner", sub: "anyone" }), false);
});

test("the owner publishes to their own workspace; nobody else can", () => {
  assert.deepEqual(canPublish(userKb("private"), owner, "ws_published"), { allowed: true });
  assert.equal(canPublish(userKb("private"), member, "ws_published").allowed, false);
  assert.equal(canPublish(userKb("private"), wsAdmin, "ws_published").allowed, false);
  assert.equal(canPublish(userKb("private"), otherOwner, "ws_published").allowed, false);
});

test("the owner CANNOT self-promote org-wide - that needs an admin", () => {
  // Definition 4.6: WS admin opens, or org admin force-opens. The owner's reach
  // stops at their own workspace.
  assert.equal(canPublish(userKb("ws_published"), owner, "org_published").allowed, false);
  assert.deepEqual(canPublish(userKb("ws_published"), wsAdmin, "org_published"), { allowed: true });
  assert.deepEqual(canPublish(userKb("ws_published"), orgAdmin, "org_published"), { allowed: true });
});

test("retraction is the owner's instant right and needs no admin", () => {
  // The whole point of the ladder is that exposure is the owner's to revoke.
  assert.deepEqual(canPublish(userKb("org_published"), owner, "private"), { allowed: true });
  assert.deepEqual(canPublish(userKb("ws_published"), owner, "private"), { allowed: true });
  assert.deepEqual(canPublish(userKb("org_published"), owner, "ws_published"), { allowed: true });
});

test("an admin may also retract, a plain member may not", () => {
  assert.deepEqual(canPublish(userKb("org_published"), wsAdmin, "private"), { allowed: true });
  assert.deepEqual(canPublish(userKb("org_published"), orgAdmin, "ws_published"), { allowed: true });
  assert.equal(canPublish(userKb("org_published"), member, "private").allowed, false);
});

test("re-publishing to the current state is an idempotent no-op for anyone", () => {
  assert.deepEqual(canPublish(userKb("ws_published"), member, "ws_published"), { allowed: true });
});

test("ownership transfer is the home WS admin's act, user-tier only", () => {
  assert.deepEqual(canTransferOwnership(userKb(), wsAdmin), { allowed: true });
  assert.equal(canTransferOwnership(userKb(), orgAdmin).allowed, false);
  assert.equal(canTransferOwnership(userKb(), owner).allowed, false);
  const platformKb: KbOwnership = { ownerType: "platform", ownerSub: null, workspaceId: "ws_1", publishState: "private" };
  assert.equal(canTransferOwnership(platformKb, wsAdmin).allowed, false);
});
