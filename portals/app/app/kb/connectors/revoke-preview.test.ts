import test from "node:test";
import assert from "node:assert/strict";
import { revokeImpact, readRevokeImpact } from "./revoke-preview";
import { InMemoryContentStore } from "../lib/content-store";
import { InMemoryBindingStore } from "./binding-store";
import type { DocumentRow } from "../lib/content-store";

const BINDING = { connectorCode: "arda", externalSourceId: "src-42" };

let seq = 0;
const doc = (verificationState: string): DocumentRow =>
  ({ id: `d${(seq += 1)}`, verificationState } as unknown as DocumentRow);

test("the verified count is broken out - it is the part that actually hurts", () => {
  // A raw total hides reviewed, vouched-for content inside the backlog. The
  // owner needs to know that revoking drops N TRUSTED documents out of recall.
  const impact = revokeImpact(BINDING, [doc("verified"), doc("verified"), doc("unverified"), doc("stale")]);
  assert.equal(impact.documents, 4);
  assert.equal(impact.verified, 2);
  assert.equal(impact.unverified, 2, "stale counts with unverified - neither is trusted content");
});

test("an empty binding costs nothing, and says so as a real zero", () => {
  const impact = revokeImpact(BINDING, []);
  assert.equal(impact.documents, 0);
  assert.equal(impact.verified, 0);
  assert.equal(impact.unverified, 0);
});

test("rebindable is ALWAYS false - the schema forbids re-binding a revoked source", () => {
  // uidx_binding_kb_connector_source is UNIQUE over (kb_id, connector_code,
  // external_source_id) with NO state predicate, and findBySource matches
  // revoked rows. So revoke is permanent for that pair, not "unsubscribe and
  // resubscribe later". The field exists to say that out loud rather than let a
  // caller assume the friendlier answer.
  assert.equal(revokeImpact(BINDING, []).rebindable, false);
  assert.equal(revokeImpact(BINDING, [doc("verified")]).rebindable, false);
});

test("the impact names the source, so a confirmation can be specific", () => {
  const impact = revokeImpact(BINDING, []);
  assert.equal(impact.connectorCode, "arda");
  assert.equal(impact.externalSourceId, "src-42");
});

test("the preview counts exactly the set the cascade will act on", async () => {
  // If the preview and the cascade disagreed, the confirmation would be a
  // guess. Both go through listLiveConnectorDocsByBinding.
  const content = new InMemoryContentStore();
  const bindings = new InMemoryBindingStore();
  const binding = await bindings.create({ kbId: "kb1", connectorCode: "arda", externalSourceId: "src-42" });

  const live = await content.createDocument({
    kbId: "kb1", title: "live", source: "connector", connectorCode: "arda",
    sourceRef: { binding_id: binding.id },
  });
  await content.setDocumentVerification(live.id, {
    verificationState: "verified", verifier: "v1", verifiedAt: new Date(), expiresAt: null,
  });
  const gone = await content.createDocument({
    kbId: "kb1", title: "deleted", source: "connector", connectorCode: "arda",
    sourceRef: { binding_id: binding.id },
  });
  await content.setDocumentState(gone.id, "deleted");

  const impact = await readRevokeImpact(binding, content);
  assert.equal(impact.documents, 1, "an already-deleted document is not leaving recall again");
  assert.equal(impact.verified, 1);
});

test("documents from ANOTHER binding are not counted", async () => {
  const content = new InMemoryContentStore();
  const bindings = new InMemoryBindingStore();
  const mine = await bindings.create({ kbId: "kb1", connectorCode: "arda", externalSourceId: "mine" });
  const other = await bindings.create({ kbId: "kb1", connectorCode: "arda", externalSourceId: "other" });

  await content.createDocument({
    kbId: "kb1", title: "theirs", source: "connector", connectorCode: "arda",
    sourceRef: { binding_id: other.id },
  });

  const impact = await readRevokeImpact(mine, content);
  assert.equal(impact.documents, 0, "revoking one source must not report another source's content");
});
