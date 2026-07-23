import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_STATES,
  DOCUMENT_STATES,
  ENTRY_STATES,
  canTransitionContent,
  assertContentTransition,
  initialContentState,
  isRecallable,
  canTransitionVerification,
  governanceApplies,
  onVerifierEdit,
  evaluateExpiry,
  passesVerificationFilter,
  DEFAULT_VERIFICATION_FILTER,
  type GovernancePolicy,
} from "./state";

// --- content state machine ---------------------------------------------------

test("Document has no draft state; Entry does (100-kb-model 5.1)", () => {
  assert.ok(!DOCUMENT_STATES.includes("draft"));
  assert.ok(ENTRY_STATES.includes("draft"));
  assert.equal(initialContentState("document"), "processing");
  assert.equal(initialContentState("entry"), "draft");
});

test("a document cannot be put into draft by any route", () => {
  for (const from of CONTENT_STATES) {
    assert.equal(canTransitionContent("document", from, "draft"), false);
  }
});

test("failed is a residency state, not terminal - it can be retried", () => {
  assert.ok(canTransitionContent("document", "failed", "processing"));
  assert.ok(canTransitionContent("entry", "failed", "processing"));
});

test("archived is restorable, deleted is terminal", () => {
  assert.ok(canTransitionContent("document", "archived", "indexed"));
  for (const to of CONTENT_STATES) {
    assert.equal(canTransitionContent("document", "deleted", to), false);
  }
});

test("indexed content can re-enter processing (reprocess / controlled rebuild)", () => {
  assert.ok(canTransitionContent("document", "indexed", "processing"));
});

test("processing cannot jump straight to archived or deleted", () => {
  assert.equal(canTransitionContent("document", "processing", "archived"), false);
  assert.equal(canTransitionContent("document", "processing", "deleted"), false);
});

test("assertContentTransition throws with both states named", () => {
  assert.throws(
    () => assertContentTransition("document", "indexed", "draft"),
    /indexed -> draft/,
  );
});

test("only indexed content is recallable", () => {
  for (const s of CONTENT_STATES) {
    assert.equal(isRecallable(s), s === "indexed");
  }
});

// --- governance state machine ------------------------------------------------

test("verification cannot skip from unverified straight to stale", () => {
  assert.equal(canTransitionVerification("unverified", "stale"), false);
  assert.ok(canTransitionVerification("unverified", "verified"));
  assert.ok(canTransitionVerification("verified", "stale"));
  assert.ok(canTransitionVerification("stale", "verified"));
});

const off: GovernancePolicy = { enabled: false, exemptSyncedContent: true };
const on: GovernancePolicy = { enabled: true, exemptSyncedContent: true, intervalDays: 30 };

test("governance off imposes no burden at all", () => {
  assert.equal(governanceApplies(off, { synced: false }), false);
  assert.equal(governanceApplies(off, { synced: true }), false);
});

test("synced content is exempt by default, and the library can override", () => {
  assert.equal(governanceApplies(on, { synced: true }), false);
  assert.equal(governanceApplies(on, { synced: false }), true);
  const strict: GovernancePolicy = { ...on, exemptSyncedContent: false };
  assert.equal(governanceApplies(strict, { synced: true }), true);
});

test("a verifier editing content counts as a review (implicit re-verification)", () => {
  assert.equal(
    onVerifierEdit({ synced: false, verificationState: "stale" }),
    "verified",
  );
  assert.equal(
    onVerifierEdit({ synced: false, verificationState: "verified" }),
    "verified",
  );
  // Editing never manufactures a verification that was never granted.
  assert.equal(
    onVerifierEdit({ synced: false, verificationState: "unverified" }),
    "unverified",
  );
});

test("expiry turns verified into stale only once the interval has elapsed", () => {
  const verifiedAt = new Date("2026-01-01T00:00:00Z");
  const subject = { synced: false, verificationState: "verified" as const, verifiedAt };
  assert.equal(evaluateExpiry(on, subject, new Date("2026-01-20T00:00:00Z")), "verified");
  assert.equal(evaluateExpiry(on, subject, new Date("2026-02-01T00:00:00Z")), "stale");
});

test("expiry never fires where governance does not apply", () => {
  const verifiedAt = new Date("2026-01-01T00:00:00Z");
  const long_ago = new Date("2027-01-01T00:00:00Z");
  assert.equal(
    evaluateExpiry(off, { synced: false, verificationState: "verified", verifiedAt }, long_ago),
    "verified",
  );
  assert.equal(
    evaluateExpiry(on, { synced: true, verificationState: "verified", verifiedAt }, long_ago),
    "verified",
  );
});

test("content state and governance state do not constrain each other", () => {
  // An archived item keeps whatever verification it had, and a stale item is
  // still `indexed`. Nothing in either machine references the other.
  const verifiedAt = new Date("2026-01-01T00:00:00Z");
  const stale = evaluateExpiry(
    on,
    { synced: false, verificationState: "verified", verifiedAt },
    new Date("2027-01-01T00:00:00Z"),
  );
  assert.equal(stale, "stale");
  assert.ok(isRecallable("indexed"), "staleness does not change recallability by itself");
  assert.ok(canTransitionContent("document", "indexed", "archived"));
});

// --- quality tier ------------------------------------------------------------

test("the default tier excludes stale but keeps unverified", () => {
  assert.equal(DEFAULT_VERIFICATION_FILTER, "verified_and_untracked");
  assert.ok(passesVerificationFilter("verified_and_untracked", "unverified"));
  assert.ok(passesVerificationFilter("verified_and_untracked", "verified"));
  assert.equal(passesVerificationFilter("verified_and_untracked", "stale"), false);
});

test("verified_only is strict, all admits everything", () => {
  assert.ok(passesVerificationFilter("verified_only", "verified"));
  assert.equal(passesVerificationFilter("verified_only", "unverified"), false);
  assert.equal(passesVerificationFilter("verified_only", "stale"), false);
  for (const s of ["unverified", "verified", "stale"] as const) {
    assert.ok(passesVerificationFilter("all", s));
  }
});
