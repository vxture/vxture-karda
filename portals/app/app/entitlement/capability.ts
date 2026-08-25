import type { Entitlement, Tier } from "./types";
import { TIERS, hasProductAccess } from "./types";

// Capability matrix MECHANISM (product_220 section 3). tier -> feature keys is
// PRODUCT knowledge - the platform never configures feature keys. The mechanism
// is inherited and versioned; the concrete FEATURE_KEYS and their tier
// assignment are karda's blank zone (product_240 section 2.9).
//
// AUTHORITY: docs/20-specs/40-tier-capability-matrix.md (KD-207, owner
// 2026-08-25). On conflict that document wins and this file follows.
//
// THE ONE THING TO UNDERSTAND BEFORE EDITING THIS FILE:
//
//   Tiers are cut on CONSUMPTION, not on features. Agent access is FULL at every
//   tier including free - `agent.read` and `agent.write`, both channels, all
//   write tools. Crippling agent access at low tiers means agents never adopt,
//   adoption never happens, and an agent knowledge platform never becomes
//   infrastructure. What separates free / starter / pro is AI credits and
//   capacity caps, nothing else: their feature-key sets are IDENTICAL, and
//   `member.max = 1` is their only hard boundary.
//
//   What protects the corpus from a free-tier agent is not the price plan - it
//   is the governance ladder: every write lands as processing/draft and passes
//   the verification layer before it is published knowledge.
//
// A test pins each of those rulings. If you find yourself moving `agent.write`
// up a tier, the test will go red on purpose - read KD-207 first.

export type FeatureKey = string;

/** Every key karda's plans can grant. Keys for capabilities that are not built
 *  yet are INCLUDED on purpose (KD-207): the pricing page states them as 即将开放
 *  rather than us re-cutting tiers after the fact and changing what existing
 *  customers bought. */
export const FEATURE_KEYS = {
  // --- open at every tier, personal tiers included ------------------------
  KB_PRIVATE: "kb.private",
  RETRIEVAL_LEXICAL: "retrieval.lexical",
  RETRIEVAL_VECTOR: "retrieval.vector",
  ANSWER_CITED: "answer.cited",
  BENCH_RECALL: "bench.recall",
  AGENT_READ: "agent.read",
  AGENT_WRITE: "agent.write",
  GOVERNANCE_VERIFICATION: "governance.verification",
  CONNECTOR_BINDING: "connector.binding",
  SHARE_WORKSPACE: "share.workspace",
  REBUILD_CONTROLLED: "rebuild.controlled", // 即将开放
  PACKAGE_SUBSCRIBE: "package.subscribe", // 即将开放
  // --- business and up: the organisation form ----------------------------
  SHARE_ORGANIZATION: "share.organization",
  ORG_MEMBERS: "org.members",
  CREDITS_ATTRIBUTION: "credits.attribution",
  PACKAGE_INSTANTIATE: "package.instantiate", // 即将开放
  SHARE_TARGETED: "share.targeted", // 即将开放
  // --- enterprise: the private-deployment form ---------------------------
  GOVERNANCE_AUDIT: "governance.audit", // 即将开放
  EVALUATION_SETS: "evaluation.sets", // 即将开放
  TEMPLATE_CUSTOM: "template.custom", // 即将开放
  DEPLOY_PRIVATE: "deploy.private", // 即将开放
} as const;

const F = FEATURE_KEYS;

/** What every personal tier gets. free, starter and pro share this list
 *  VERBATIM - see the header. They differ only in credits and caps. */
const PERSONAL: FeatureKey[] = [
  F.KB_PRIVATE,
  F.RETRIEVAL_LEXICAL,
  F.RETRIEVAL_VECTOR,
  F.ANSWER_CITED,
  F.BENCH_RECALL,
  F.AGENT_READ,
  F.AGENT_WRITE,
  F.GOVERNANCE_VERIFICATION,
  F.CONNECTOR_BINDING,
  F.SHARE_WORKSPACE,
  F.REBUILD_CONTROLLED,
  F.PACKAGE_SUBSCRIBE,
];

/** business adds the organisation form: seats, org-wide sharing, and the
 *  attribution that an org-SHARED credit pool makes necessary rather than nice
 *  (40-tier-capability-matrix section 7.3). */
const BUSINESS: FeatureKey[] = [
  ...PERSONAL,
  F.SHARE_ORGANIZATION,
  F.ORG_MEMBERS,
  F.CREDITS_ATTRIBUTION,
  F.PACKAGE_INSTANTIATE,
  F.SHARE_TARGETED,
];

/** enterprise adds what private delivery is bought for: provable compliance,
 *  provable quality, and dedicated resources. */
const ENTERPRISE: FeatureKey[] = [
  ...BUSINESS,
  F.GOVERNANCE_AUDIT,
  F.EVALUATION_SETS,
  F.TEMPLATE_CUSTOM,
  F.DEPLOY_PRIVATE,
];

// Cumulative per tier (a higher tier includes everything lower tiers have).
export const CAPABILITY_MATRIX: Record<Tier, FeatureKey[]> = {
  free: PERSONAL,
  starter: PERSONAL,
  pro: PERSONAL,
  business: BUSINESS,
  enterprise: ENTERPRISE,
};

export function canUseFeature(e: Entitlement, key: FeatureKey): boolean {
  if (!hasProductAccess(e) || e.tier == null) return false;
  return CAPABILITY_MATRIX[e.tier].includes(key);
}

/** Lowest tier that unlocks a feature, or null if no tier grants it. */
export function minTierFor(key: FeatureKey): Tier | null {
  for (const tier of TIERS) {
    if (CAPABILITY_MATRIX[tier].includes(key)) return tier;
  }
  return null;
}

// --- max-type caps (the ONE thing karda still judges) -----------------------
//
// The split, fixed by KD-207 and worth restating where the code is:
//
//   AI credits   PLATFORM judges. karda never pre-checks a balance, never
//                refuses on credits, and builds no out-of-credits flow. If the
//                call reaches karda, karda serves it; usage flushes to
//                /usage/consume and a 409 marks the row gated - the record still
//                stands. There is deliberately NO credit code in this file.
//   these caps   PRODUCT judges, because only karda can count them: the platform
//                cannot know how many libraries a workspace has.

export const LIMIT_KEYS = ["kb.max", "document.max", "storage.bytes", "binding.max", "member.max"] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];

/**
 * Limit keys the entitlement envelope failed to declare.
 *
 * `withinCap` is FAIL-CLOSED when a cap is absent, so a key the platform forgot
 * presents to a user as a capability that inexplicably refuses - with no error,
 * no log, and nothing to search for. Surfacing the missing keys turns the
 * hardest class of support ticket into a visible misconfiguration.
 *
 * Empty array = correctly configured. Callers should treat a non-empty result as
 * an operations alarm, not as a user-facing error.
 */
export function missingLimitKeys(e: Entitlement): LimitKey[] {
  return LIMIT_KEYS.filter((k) => !Object.prototype.hasOwnProperty.call(e.limits, k));
}
