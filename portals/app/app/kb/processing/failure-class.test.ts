import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyOutcome } from "./stages";

// `unavailable` splits off from `quota` (incr/0008). Both suspend, so nothing
// about the queue changes - what changes is what an operator is TOLD, and the
// two need opposite actions: chase the grant, versus wait.

test("unavailable suspends, exactly like quota", () => {
  assert.deepEqual(classifyOutcome("unavailable", "embed", 0), { action: "suspend" });
  assert.deepEqual(classifyOutcome("quota", "embed", 0), { action: "suspend" });
});

test("neither burns a retry - a parked task must not age into failed", () => {
  // The whole point of parking: it comes back on its own, however long it waits.
  for (const cls of ["quota", "unavailable"] as const) {
    assert.deepEqual(classifyOutcome(cls, "embed", 99), { action: "suspend" });
  }
});

test("transient and permanent are untouched by the split", () => {
  assert.deepEqual(classifyOutcome("permanent", "parse", 0), { action: "fail" });
  assert.equal(classifyOutcome("transient", "fetch", 0).action, "retry");
  assert.equal(classifyOutcome("transient", "fetch", 99).action, "fail");
});
