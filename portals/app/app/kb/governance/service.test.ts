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
const NOW = PAST_INTERVAL;

/** Two workspaces, each with one library holding one document that has already
 *  lapsed. The shape the scoped-sweep tests need: without a scope both stale,
 *  with a scope only one does. */
async function twoWorkspaceCorpus() {
  const kbs = new InMemoryKbStore();
  const content = new InMemoryContentStore();
  const gov = new GovernanceService(content, kbs);

  const make = async (ws: string) => {
    const kb = await kbs.createKb({ workspaceId: ws, ownerType: "user", ownerSub: "u1", name: `L-${ws}` });
    await kbs.updateKb(kb.id, {
      governanceEnabled: true,
      defaultVerifyIntervalDays: 30,
      exemptSyncedContent: true,
      defaultVerifier: "v1",
    });
    const doc = await content.createDocument({ kbId: kb.id, title: "d", source: "upload" });
    await gov.verifyDocument(doc.id, "v1", T0);
    return { kbId: kb.id, docId: doc.id };
  };

  const a = await make("wsA");
  const b = await make("wsB");
  return { content, kbs, kbA: a.kbId, docA: a.docId, kbB: b.kbId, docB: b.docId };
}

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

// --- scoped sweep (batch 11: the user-triggered path) -------------------------

test("an unscoped sweep still scans everything - the cron path is unchanged", async () => {
  const { content, kbs } = await twoWorkspaceCorpus();
  const gov = new GovernanceService(content, kbs);
  const summary = await gov.sweep(NOW);
  assert.equal(summary.staled, 2, "both workspaces' lapsed items");
});

test("a scoped sweep touches ONLY the named libraries", async () => {
  // This is the whole reason the user path passes a scope: without it, one
  // tenant pressing the button in 验证评测 re-states every other tenant's corpus.
  const { content, kbs, kbA, docB } = await twoWorkspaceCorpus();
  const gov = new GovernanceService(content, kbs);

  const summary = await gov.sweep(NOW, 200, [kbA]);
  assert.equal(summary.staled, 1);

  const other = await content.getDocument(docB);
  assert.equal(other?.verificationState, "verified", "the other workspace's document must be untouched");
});

test("an EMPTY scope sweeps nothing - it is not the same as no scope", async () => {
  // A workspace with no libraries yields []. If that collapsed to "no filter"
  // the emptiest possible caller would trigger the widest possible sweep.
  const { content, kbs } = await twoWorkspaceCorpus();
  const summary = await new GovernanceService(content, kbs).sweep(NOW, 200, []);
  assert.equal(summary.scanned, 0);
  assert.equal(summary.staled, 0);
});
