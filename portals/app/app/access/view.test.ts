import { test } from "node:test";
import assert from "node:assert/strict";
import { gateView } from "./view";
import type { AuthUser } from "../auth/lib/claims";
import { EMPTY_ENTITLEMENT } from "../entitlement/types";

const user: AuthUser = { sub: "u", activeOrg: "o", activeOrgType: "organization", activeWorkspace: "w", roles: [], accountStatus: "active", canManage: false, isWorkspaceOwner: false };
function commercial(canManage: boolean, status: "expired" | "suspended" | null = null) {
  return gateView({ kind: "resolved", state: { status: "authenticated", user: { ...user, canManage }, entitlement: { ...EMPTY_ENTITLEMENT, workspace_id: "w", product: "karda", status }, gates: { productAccess: false, dataAccess: false, cta: status ? "renew" : "subscribe" } } }, "/assets");
}
test("subscription actions require authoritative management eligibility", () => {
  assert.equal(commercial(false).action, undefined);
  assert.equal(commercial(true).action?.href, "https://vxture.com/zh-CN/pricing?product=karda");
  assert.equal(commercial(true, "expired").state, "expired");
  assert.equal(commercial(true, "suspended").action, undefined);
});
test("unassigned access and configuration failure offer recheck without purchase", () => {
  for (const status of ["product-unassigned", "inactive-account", "unconfigured"] as const) {
    const view = gateView({ kind: "resolved", state: { status } }, "/assets");
    assert.equal(view.action, undefined);
    assert.equal(view.retry, true);
    assert.ok(view.hint.length);
  }
});
test("login preserves the verified destination; network failures never suggest login", () => {
  const view = gateView({ kind: "resolved", state: { status: "anonymous" } }, "/assets?x=1");
  assert.equal(view.action?.href, "/auth/login?returnTo=%2Fassets%3Fx%3D1");
  const failure = gateView({ kind: "error" }, "/assets");
  assert.equal(failure.action, undefined);
  assert.equal(failure.retry, true);
});
