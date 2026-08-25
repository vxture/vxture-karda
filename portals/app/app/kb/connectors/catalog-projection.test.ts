import test from "node:test";
import assert from "node:assert/strict";
import { CONNECTORS, degradations, meetsDeleteInvariant, type ConnectorCapabilities } from "./catalog";

// What GET /api/connectors projects. The route is a thin map over CONNECTORS, so
// what is worth pinning is that the projection carries the WARNINGS and not just
// the names - a bind form that lists connectors without their accepted
// trade-offs is exactly the "silently absorbed degradation" section 4 forbids.

function project(caps: ConnectorCapabilities) {
  return { degradations: degradations(caps), meetsDeleteInvariant: meetsDeleteInvariant(caps) };
}

test("every registered connector projects a degradations array, even when empty", () => {
  // An empty array means "no accepted trade-offs", which is a real answer. A
  // missing field would make the UI unable to tell that from "not computed".
  for (const c of CONNECTORS) {
    assert.ok(Array.isArray(degradations(c.capabilities)), `${c.code} has no degradations array`);
  }
});

test("the weakest possible connector reports BOTH a compliance gap and its trade-offs", () => {
  // This is the case the single-connector registry cannot exercise today, and
  // the one the UI most needs to get right: karda-polled, un-reconcilable,
  // delete-by-absence. If this ever renders as a clean bind, sensitive content
  // can be attached to a source that cannot express a deletion.
  const weakest = project({
    changeDetection: "karda",
    delivery: "poll",
    fetch: "direct",
    reconcile: "none",
    deleteSignal: "absence",
  });
  assert.equal(weakest.meetsDeleteInvariant, false, "I4 is unmet - this is a compliance gap, not a UX one");
  assert.equal(weakest.degradations.length, 3, "poll latency + no reconcile + undetectable deletes");
  assert.ok(weakest.degradations.includes("deletesUndetectable"));
});

test("a mid-strength connector reports the WEAKER delete wording, not the absolute one", () => {
  // reconcile:list + absence can still find deletes, just badly. Saying deletes
  // "cannot be detected" here would be false and would block a usable source.
  const mid = project({
    changeDetection: "karda",
    delivery: "poll",
    fetch: "direct",
    reconcile: "list",
    deleteSignal: "absence",
  });
  assert.equal(mid.meetsDeleteInvariant, true);
  assert.ok(mid.degradations.includes("deletesByReconcileOnly"));
  assert.ok(!mid.degradations.includes("deletesUndetectable"));
});

test("the strongest connector has nothing to warn about", () => {
  const arda = CONNECTORS.find((c) => c.code === "arda");
  assert.ok(arda);
  assert.deepEqual(degradations(arda.capabilities), []);
  assert.equal(meetsDeleteInvariant(arda.capabilities), true);
});
