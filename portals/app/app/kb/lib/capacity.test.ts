import { test } from "node:test";
import assert from "node:assert/strict";
import { CapacityError, entitlementCapacityLimit, validateCapacityLimit } from "./capacity";
import { EMPTY_ENTITLEMENT } from "../../entitlement/types";
import { KbService } from "./service";
import { InMemoryKbStore } from "./store";
import { errorStatus } from "../api/http";

test("capacity rejects absent, fractional, unsafe and invalid limits", () => {
  for (const limit of [undefined, NaN, Infinity, -2, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateCapacityLimit(limit), { code: "capacity_unconfigured" });
  }
  for (const limit of [-1, 0, 1, 100]) assert.equal(validateCapacityLimit(limit), limit);
});

test("only absent content-count caps are optional after confirming data access", () => {
  const denied = { ...EMPTY_ENTITLEMENT, workspace_id: "ws-1", product: "karda" };
  const entitled = { ...denied, tier: "pro" as const, limits: {} };
  assert.equal(entitlementCapacityLimit(entitled, "document.max"), -1);
  for (const metric of ["kb.max", "binding.max", "storage.bytes"] as const) {
    assert.throws(() => validateCapacityLimit(entitlementCapacityLimit(entitled, metric)), { code: "capacity_unconfigured" });
  }
  assert.throws(() => entitlementCapacityLimit(denied, "document.max"), { code: "capacity_unavailable" });
  for (const limit of [-1, 0, 10]) {
    assert.equal(entitlementCapacityLimit({ ...entitled, limits: { "document.max": limit } }, "document.max"), limit);
  }
  for (const invalid of [undefined, NaN, -2, 0.5]) {
    const limits = { "document.max": invalid } as unknown as Record<string, number>;
    assert.throws(() => validateCapacityLimit(entitlementCapacityLimit({ ...entitled, limits }, "document.max")), { code: "capacity_unconfigured" });
  }
});

test("capacity errors preserve actionable codes without internal error details", async () => {
  for (const code of ["capacity_exceeded", "capacity_unconfigured", "capacity_unavailable"] as const) {
    class RefusingStore extends InMemoryKbStore {
      override async createKb(): Promise<never> { throw new CapacityError(code); }
    }
    assert.deepEqual(await new KbService(new RefusingStore()).create({
      workspaceId: "test-workspace", ownerType: "user", ownerSub: "test-sub", name: "test",
    }), { ok: false, error: { code, metric: "kb.max" } });
    assert.equal(errorStatus(code), code === "capacity_exceeded" ? 403 : 503);
  }
});
