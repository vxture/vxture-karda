import { test } from "node:test";
import assert from "node:assert/strict";
import { withinCap, poolRemaining, isUnlimited, limitOf } from "./quota";
import { EMPTY_ENTITLEMENT, type Entitlement } from "./types";

function ent(over: Partial<Entitlement>): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: "ws", product: "p", ...over };
}

test("withinCap admits below the cap, denies at/above", () => {
  const e = ent({ limits: { "seat.max": 3 } });
  assert.equal(withinCap(e, "seat.max", 2), true);
  assert.equal(withinCap(e, "seat.max", 3), false);
});

test("-1 is unlimited", () => {
  assert.equal(isUnlimited(-1), true);
  assert.equal(withinCap(ent({ limits: { "seat.max": -1 } }), "seat.max", 999999), true);
});

test("absent cap denies by default (fail-closed) unless a default is given", () => {
  assert.equal(withinCap(ent({}), "seat.max", 0), false);
  assert.equal(withinCap(ent({}), "seat.max", 0, { defaultWhenAbsent: 1 }), true);
});

test("limitOf and poolRemaining", () => {
  assert.equal(limitOf(ent({ limits: { "dataset.max": 500 } }), "dataset.max"), 500);
  assert.equal(limitOf(ent({}), "dataset.max"), undefined);
  const e = ent({ quota_pools: [{ metric: "ai.credit", limit: 100, remaining: 40, priority: 100 }] });
  assert.equal(poolRemaining(e, "ai.credit"), 40);
  assert.equal(poolRemaining(e, "nope"), 0);
});

test("consumable pools add across package and top-up regardless of order", () => {
  const pools = [{ metric: "ai.credit", limit: 10, remaining: 0, priority: 1 },
    { metric: "ai.credit", limit: 30, remaining: 25, priority: 2 },
    { metric: "other", limit: 100, remaining: 100, priority: 1 },
    { metric: "ai.credit", limit: 10, remaining: -2, priority: 3 }];
  for (const quota_pools of [pools, [...pools].reverse()]) {
    assert.equal(poolRemaining(ent({ quota_pools }), "ai.credit"), 23);
  }
});
