import { test } from "node:test";
import assert from "node:assert/strict";
import { userAdmission } from "./admission";
import { toAuthUser } from "../auth/lib/claims";
import { sessionRole } from "../_lib/session";
import type { SessionUser } from "../_lib/api";
import { makeEntitlement } from "../entitlement/resolver";

const user = toAuthUser({ sub: "usr_new", active_org: "org", active_workspace: "ws",
  account_status: "active", roles: [] });
const subscription = makeEntitlement("ws", "karda", { tier: "pro", status: "active" });
const deps = {
  context: async () => ({ orgId: "org", workspaceId: "ws", subject: "usr_new", subjectToken: "test-only" }),
  assigned: async () => true,
  entitlement: async () => subscription,
};

test("new platform-admitted member can use Karda without a governance role", async () => {
  assert.equal((await userAdmission(user, deps)).allowed, true);
  assert.deepEqual(user.roles, []);
  assert.equal(user.canManage, false);
  assert.equal(user.isWorkspaceOwner, false);
  assert.equal(sessionRole({ canManage: false, isWorkspaceOwner: false } as SessionUser), "member");
});

test("default member never bypasses assignment, subscription or platform failure", async () => {
  const denied = await userAdmission(user, { ...deps, assigned: async () => false,
    entitlement: async () => { assert.fail("denied members must not read entitlement"); } });
  assert.equal(denied.allowed, false);
  assert.equal(denied.error, "product_unassigned");
  assert.equal((await userAdmission(user, { ...deps,
    entitlement: async () => ({ ...subscription, tier: null, status: "expired" }) })).allowed, false);
  await assert.rejects(userAdmission(user, { ...deps,
    assigned: async () => { throw new Error("unavailable"); } }), /unavailable/);
});

test("inactive members cannot obtain default access", async () => {
  const result = await userAdmission({ ...user, accountStatus: "disabled" }, {
    ...deps, context: async () => { assert.fail("inactive member must not resolve authority"); },
  });
  assert.equal(result.allowed, false);
  assert.equal(result.error, "inactive_account");
});


test("a formerly admitted member is denied on the next request after platform revocation", async () => {
  let assigned = true;
  const authority = { ...deps, assigned: async () => assigned };
  assert.equal((await userAdmission(user, authority)).allowed, true);
  assigned = false;
  assert.equal((await userAdmission(user, authority)).allowed, false);
});
