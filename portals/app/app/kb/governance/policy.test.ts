import { test } from "node:test";
import assert from "node:assert/strict";
import { policyForKb } from "./policy";
import { InMemoryKbStore } from "../lib/store";

test("policyForKb maps the library's governance knobs; null interval -> undefined", async () => {
  const kbs = new InMemoryKbStore();
  const kb = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "L" });

  // defaults: governance off, synced exempt, no interval
  let p = policyForKb(kb);
  assert.equal(p.enabled, false);
  assert.equal(p.exemptSyncedContent, true);
  assert.equal(p.intervalDays, undefined, "null interval normalises to undefined");

  const updated = await kbs.updateKb(kb.id, {
    governanceEnabled: true,
    exemptSyncedContent: false,
    defaultVerifyIntervalDays: 14,
  });
  assert.ok(updated);
  p = policyForKb(updated);
  assert.deepEqual(p, { enabled: true, exemptSyncedContent: false, intervalDays: 14 });
});
