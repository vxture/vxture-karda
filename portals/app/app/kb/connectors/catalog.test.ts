import { test } from "node:test";
import assert from "node:assert/strict";
import { connectorByCode, isKnownConnector, degradations, meetsDeleteInvariant, type ConnectorCapabilities } from "./catalog";

test("the registry resolves arda and rejects unknown codes", () => {
  const arda = connectorByCode("arda");
  assert.ok(arda);
  assert.equal(arda.capabilities.delivery, "notify");
  assert.equal(isKnownConnector("arda"), true);
  assert.equal(connectorByCode("sharepoint"), null);
  assert.equal(isKnownConnector("sharepoint"), false);
});

test("arda's capability set has no accepted degradations and meets the delete invariant", () => {
  const arda = connectorByCode("arda")!;
  assert.deepEqual(degradations(arda.capabilities), []);
  assert.equal(meetsDeleteInvariant(arda.capabilities), true);
});

test("a poll/karda/absence source surfaces every trade-off and the hard delete gap", () => {
  const weak: ConnectorCapabilities = {
    changeDetection: "karda",
    delivery: "poll",
    fetch: "direct",
    reconcile: "none",
    deleteSignal: "absence",
  };
  const warnings = degradations(weak);
  assert.equal(warnings.length, 3, "poll-latency + no-reconcile + undetectable-deletes");
  assert.ok(warnings.some((w) => /CANNOT be detected/.test(w)));
  assert.equal(meetsDeleteInvariant(weak), false, "absence + no reconcile fails I4");
});

test("absence deletes are met (weakly) when a reconcile list exists", () => {
  const caps: ConnectorCapabilities = {
    changeDetection: "karda",
    delivery: "poll",
    fetch: "direct",
    reconcile: "list",
    deleteSignal: "absence",
  };
  assert.equal(meetsDeleteInvariant(caps), true);
  assert.ok(degradations(caps).some((w) => /weakest form/.test(w)));
});
