import { test } from "node:test";
import assert from "node:assert/strict";
import { CapacityError, validateCapacityLimit } from "./capacity";
import { KbService } from "./service";
import { InMemoryKbStore } from "./store";
import { errorStatus } from "../api/http";

test("capacity rejects absent, fractional, unsafe and invalid limits", () => {
  for (const limit of [undefined, NaN, Infinity, -2, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => validateCapacityLimit(limit), { code: "capacity_unconfigured" });
  }
  for (const limit of [-1, 0, 1, 100]) assert.equal(validateCapacityLimit(limit), limit);
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
