import { test } from "node:test";
import assert from "node:assert/strict";
import { parseProvisioningPayload, readWebhookBody } from "./payload";
const raw = { id: "delivery-1", type: "tenant.provisioned", application: "karda", seq: 1,
  occurred_at: 1000, tenant_id: "11111111-1111-4111-8111-111111111111", workspace_id: "22222222-2222-4222-8222-222222222222" };
test("signed payload binds optional headers and requires lifecycle version", () => {
  assert.equal(parseProvisioningPayload(raw, new Headers()).seq, 1);
  for (const change of [{ seq: undefined }, { seq: 0 }, { seq: 1.5 }, { seq: Infinity },
    { workspace_id: "" }, { application: "karda-beta" }, { occurred_at: undefined }]) {
    assert.throws(() => parseProvisioningPayload({ ...raw, ...change }, new Headers()));
  }
  assert.throws(() => parseProvisioningPayload(raw, new Headers({ "x-vxture-delivery": "other" })));
  assert.throws(() => parseProvisioningPayload(raw, new Headers({ "x-vxture-event": "grant.invalidated" })));
});
test("versionless notifications stay versionless", () => {
  const notification = { ...raw, type: "subscription_changed", seq: undefined };
  assert.equal(parseProvisioningPayload(notification, new Headers()).seq, undefined);
  assert.throws(() => parseProvisioningPayload({ ...notification, seq: 0 }, new Headers()));
});
test("body budget applies even when Content-Length is absent", async () => {
  await assert.rejects(readWebhookBody(new Request("https://example.test", { method: "POST", body: "x".repeat(1048577) })));
  assert.equal(await readWebhookBody(new Request("https://example.test", { method: "POST", body: "{}" })), "{}");
});
