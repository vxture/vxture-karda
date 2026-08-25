import test from "node:test";
import assert from "node:assert/strict";
import {
  CAPABILITY_MATRIX,
  FEATURE_KEYS,
  LIMIT_KEYS,
  canUseFeature,
  minTierFor,
  missingLimitKeys,
} from "./capability";
import { EMPTY_ENTITLEMENT, TIERS, type Entitlement, type Tier } from "./types";

const F = FEATURE_KEYS;
const PERSONAL_TIERS: Tier[] = ["free", "starter", "pro"];

function ent(over: Partial<Entitlement> = {}): Entitlement {
  return { ...EMPTY_ENTITLEMENT, workspace_id: "ws-1", product: "karda", ...over };
}

// --- the rulings, pinned (KD-207) -------------------------------------------

test("KD-207: the three PERSONAL tiers grant an IDENTICAL feature set", () => {
  // Tiers are cut on consumption, not features. If this goes red, someone
  // re-gated a capability by price - read KD-207 before "fixing" the test.
  const [free, starter, pro] = PERSONAL_TIERS.map((t) => [...CAPABILITY_MATRIX[t]].sort());
  assert.deepEqual(free, starter);
  assert.deepEqual(starter, pro);
});

test("KD-207: agent access is FULL at free - both read and write", () => {
  // Crippling agent access at low tiers means agents never adopt, and an agent
  // knowledge platform never becomes infrastructure. What protects the corpus is
  // the governance ladder (writes land as draft), not the price plan.
  assert.equal(minTierFor(F.AGENT_READ), "free");
  assert.equal(minTierFor(F.AGENT_WRITE), "free");
});

test("KD-207: vector retrieval and cited answering are free-tier too", () => {
  // The v0.1 proposal held these back to protect the Atlas bill. Overturned:
  // the bill is controlled by credits, which the PLATFORM meters.
  assert.equal(minTierFor(F.RETRIEVAL_VECTOR), "free");
  assert.equal(minTierFor(F.ANSWER_CITED), "free");
});

test("KD-207: the organisation form starts at business", () => {
  assert.equal(minTierFor(F.SHARE_ORGANIZATION), "business");
  assert.equal(minTierFor(F.ORG_MEMBERS), "business");
  // Attribution is business+ because that is where the credit pool becomes
  // org-SHARED and "who spent it" turns into a real question.
  assert.equal(minTierFor(F.CREDITS_ATTRIBUTION), "business");
});

test("KD-207: audit, quality baselines and private deployment are enterprise", () => {
  assert.equal(minTierFor(F.GOVERNANCE_AUDIT), "enterprise");
  assert.equal(minTierFor(F.EVALUATION_SETS), "enterprise");
  assert.equal(minTierFor(F.DEPLOY_PRIVATE), "enterprise");
});

// --- structural invariants ---------------------------------------------------

test("the matrix is cumulative - every tier is a superset of the one below", () => {
  for (let i = 1; i < TIERS.length; i++) {
    const lower = CAPABILITY_MATRIX[TIERS[i - 1]];
    const higher = new Set(CAPABILITY_MATRIX[TIERS[i]]);
    for (const key of lower) {
      assert.ok(higher.has(key), `${TIERS[i]} is missing ${key}, which ${TIERS[i - 1]} grants`);
    }
  }
});

test("every declared feature key is reachable from some tier", () => {
  // A key defined but granted nowhere is a pricing page promising something no
  // plan sells.
  for (const key of Object.values(FEATURE_KEYS)) {
    assert.notEqual(minTierFor(key), null, `${key} is granted by no tier`);
  }
});

test("no tier grants a key that is not declared in FEATURE_KEYS", () => {
  const declared = new Set<string>(Object.values(FEATURE_KEYS));
  for (const tier of TIERS) {
    for (const key of CAPABILITY_MATRIX[tier]) {
      assert.ok(declared.has(key), `${tier} grants undeclared key ${key}`);
    }
  }
});

test("no tier lists a key twice", () => {
  for (const tier of TIERS) {
    const keys = CAPABILITY_MATRIX[tier];
    assert.equal(new Set(keys).size, keys.length, `${tier} has duplicate keys`);
  }
});

// --- gating ------------------------------------------------------------------

test("no tier means no feature, however the key is listed", () => {
  assert.equal(canUseFeature(ent({ tier: null }), F.KB_PRIVATE), false);
  // bundled grants DATA access, not the product surface - so still no feature.
  assert.equal(canUseFeature(ent({ tier: null, bundled: true }), F.KB_PRIVATE), false);
});

test("a subscribed workspace gets exactly its tier's keys", () => {
  const free = ent({ tier: "free" });
  assert.equal(canUseFeature(free, F.AGENT_WRITE), true);
  assert.equal(canUseFeature(free, F.SHARE_ORGANIZATION), false);

  const business = ent({ tier: "business" });
  assert.equal(canUseFeature(business, F.SHARE_ORGANIZATION), true);
  assert.equal(canUseFeature(business, F.GOVERNANCE_AUDIT), false);
});

// --- limit keys --------------------------------------------------------------

test("missingLimitKeys names what the platform forgot", () => {
  // withinCap is fail-closed on an absent cap, so a forgotten key presents as a
  // capability that inexplicably refuses - no error, nothing to search for.
  const complete = ent({
    tier: "pro",
    limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, 1])),
  });
  assert.deepEqual(missingLimitKeys(complete), []);

  const partial = ent({ tier: "pro", limits: { "kb.max": 10 } });
  assert.deepEqual(missingLimitKeys(partial), ["document.max", "storage.bytes", "binding.max", "member.max"]);
});

test("a zero or unlimited cap counts as DECLARED, not as missing", () => {
  const e = ent({
    tier: "free",
    limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, 0])),
  });
  assert.deepEqual(missingLimitKeys(e), []);
  const unlimited = ent({ tier: "enterprise", limits: Object.fromEntries(LIMIT_KEYS.map((k) => [k, -1])) });
  assert.deepEqual(missingLimitKeys(unlimited), []);
});

test("member.max is a limit key, not a feature key - it is what makes a tier personal", () => {
  assert.ok(LIMIT_KEYS.includes("member.max"));
});

test("credits are never a CAP here - the platform judges them, karda serves", () => {
  // KD-207 section 7.0: karda never pre-checks a balance, never refuses on
  // credits, and builds no out-of-credits flow. A credit-shaped LIMIT key would
  // be the first step back to the product re-deriving a commercial decision,
  // because withinCap() would immediately start refusing on it.
  assert.deepEqual(
    LIMIT_KEYS.filter((k) => k.includes("credit")),
    [],
    "a credit cap in LIMIT_KEYS would make withinCap refuse on credits",
  );

  // `credits.attribution` is deliberately NOT a violation: it answers WHAT WAS
  // USED - which only the product can know - rather than WHETHER MORE MAY BE.
  assert.equal(minTierFor(F.CREDITS_ATTRIBUTION), "business");
});
