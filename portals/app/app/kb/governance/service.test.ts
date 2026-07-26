import { test } from "node:test";
import assert from "node:assert/strict";
import { GovernanceService } from "./service";
import { InMemoryContentStore } from "../lib/content-store";
import { InMemoryKbStore } from "../lib/store";

async function fixture(opts: { governanceEnabled?: boolean; intervalDays?: number | null; exemptSynced?: boolean } = {}) {
  const kbs = new InMemoryKbStore();
  const content = new InMemoryContentStore();
  const gov = new GovernanceService(content, kbs);
  const kb = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "L" });
  await kbs.updateKb(kb.id, {
    governanceEnabled: opts.governanceEnabled ?? true,
    defaultVerifyIntervalDays: opts.intervalDays === undefined ? 30 : opts.intervalDays,
    exemptSyncedContent: opts.exemptSynced ?? true,
    defaultVerifier: "v1",
  });
  return { kbs, content, gov, kbId: kb.id };
}

const T0 = new Date("2026-07-01T00:00:00Z");
const PAST_INTERVAL = new Date("2026-08-15T00:00:00Z"); // > 30 days after T0

test("verify stamps the clock: verified + verifier + expiresAt = now + interval", async () => {
  const { content, gov, kbId } = await fixture({ intervalDays: 30 });
  const doc = await content.createDocument({ kbId, title: "d", source: "upload" });
  const r = await gov.verifyDocument(doc.id, "v1", T0);
  assert.ok(r.ok);
  assert.equal(r.value.verificationState, "verified");
  assert.equal(r.value.verifier, "v1");
  assert.equal(r.value.verifiedAt?.toISOString(), T0.toISOString());
  assert.equal(r.value.expiresAt?.toISOString(), new Date("2026-07-31T00:00:00Z").toISOString());
});

test("verify with no interval sets no expiry (verify-once)", async () => {
  const { content, gov, kbId } = await fixture({ intervalDays: null });
  const doc = await content.createDocument({ kbId, title: "d", source: "upload" });
  const r = await gov.verifyDocument(doc.id, "v1", T0);
  assert.ok(r.ok);
  assert.equal(r.value.verificationState, "verified");
  assert.equal(r.value.expiresAt, null);
});

test("verify is refused when governance is off (nothing to verify)", async () => {
  const { content, gov, kbId } = await fixture({ governanceEnabled: false });
  const doc = await content.createDocument({ kbId, title: "d", source: "upload" });
  const r = await gov.verifyDocument(doc.id, "v1", T0);
  assert.ok(!r.ok);
  assert.equal(r.error.code, "governance_off");
});

test("verify is refused for connector-synced content in a library that exempts it", async () => {
  const { content, gov, kbId } = await fixture({ exemptSynced: true });
  const doc = await content.createDocument({ kbId, title: "d", source: "connector", connectorCode: "arda" });
  const r = await gov.verifyDocument(doc.id, "v1", T0);
  assert.ok(!r.ok);
  assert.equal(r.error.code, "governance_exempt");
});

test("verify is allowed for synced content when the library does NOT exempt it", async () => {
  const { content, gov, kbId } = await fixture({ exemptSynced: false });
  const doc = await content.createDocument({ kbId, title: "d", source: "connector", connectorCode: "arda" });
  const r = await gov.verifyDocument(doc.id, "v1", T0);
  assert.ok(r.ok);
  assert.equal(r.value.verificationState, "verified");
});

test("verifyDocument on a missing document is not_found", async () => {
  const { gov } = await fixture();
  const r = await gov.verifyDocument("nope", "v1", T0);
  assert.ok(!r.ok);
  assert.equal(r.error.code, "not_found");
});

test("sweep moves a lapsed verified document to stale, keeping the verifier record", async () => {
  const { content, gov, kbId } = await fixture({ intervalDays: 30 });
  const doc = await content.createDocument({ kbId, title: "d", source: "upload" });
  await gov.verifyDocument(doc.id, "v1", T0);

  const before = await gov.sweep(T0); // not yet due
  assert.equal(before.staled, 0, "not due at verification time");

  const s = await gov.sweep(PAST_INTERVAL);
  assert.equal(s.scanned, 1);
  assert.equal(s.staled, 1);
  const after = await content.getDocument(doc.id);
  assert.equal(after?.verificationState, "stale");
  assert.equal(after?.verifier, "v1", "the verifier is retained as the lapse record");
});

test("sweep never fabricates a stale in a library that has since turned governance off", async () => {
  const { content, gov, kbs, kbId } = await fixture({ intervalDays: 30 });
  const doc = await content.createDocument({ kbId, title: "d", source: "upload" });
  await gov.verifyDocument(doc.id, "v1", T0);
  await kbs.updateKb(kbId, { governanceEnabled: false });

  const s = await gov.sweep(PAST_INTERVAL);
  assert.equal(s.staled, 0, "governance off -> evaluateExpiry leaves it verified");
  assert.equal((await content.getDocument(doc.id))?.verificationState, "verified");
});

test("verifyEntry works for an authored entry (never synced)", async () => {
  const { content, gov, kbId } = await fixture({ intervalDays: 7 });
  const entry = await content.createEntry({ kbId, contentTemplateId: "ctpl_faq", templateVersion: 1, fields: { q: "x" } });
  const r = await gov.verifyEntry(entry.id, "v1", T0);
  assert.ok(r.ok);
  assert.equal(r.value.verificationState, "verified");
  assert.equal(r.value.expiresAt?.toISOString(), new Date("2026-07-08T00:00:00Z").toISOString());
});
