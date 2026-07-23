// The two orthogonal state machines from 100-kb-model section 5.
//
// Orthogonal is the load-bearing word: content state (system-driven) and
// governance state (human-driven) never constrain each other. A stale document
// is still `indexed`; an archived one keeps whatever verification it had. The
// only place governance touches retrieval is the quality tier in section 5.3,
// and that is a read-time filter, not a state transition.
//
// Keeping them separate here means neither machine has to know the other exists,
// which is what stops the classic knowledge-base tangle where "needs review"
// silently becomes a content state and everything downstream has to special-case
// it.

export const CONTENT_STATES = [
  "draft",
  "processing",
  "indexed",
  "failed",
  "archived",
  "deleted",
] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

export const VERIFICATION_STATES = ["unverified", "verified", "stale"] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

/** Document has no `draft`: a file is in processing the moment it arrives. */
export const DOCUMENT_STATES: readonly ContentState[] = CONTENT_STATES.filter(
  (s) => s !== "draft",
);

/** Entry has `draft`: editing must not enter the index. */
export const ENTRY_STATES: readonly ContentState[] = CONTENT_STATES;

export type ContentKind = "document" | "entry";

// --- content state machine --------------------------------------------------

// Transitions are listed as they read in 100-kb-model 5.1. `failed` is a
// residency state, not a terminal one - it can be retried back into processing,
// which is the whole point of making failure explicit rather than dropping the
// document silently.
const CONTENT_TRANSITIONS: Record<ContentState, readonly ContentState[]> = {
  draft: ["processing", "deleted"],
  processing: ["indexed", "failed"],
  indexed: ["processing", "archived", "deleted"], // reprocessing re-enters processing
  failed: ["processing", "deleted"], // retry, or give up
  archived: ["indexed", "deleted"], // restorable
  deleted: [], // terminal; lineage is retained separately for the audit window
};

export function contentStatesFor(kind: ContentKind): readonly ContentState[] {
  return kind === "document" ? DOCUMENT_STATES : ENTRY_STATES;
}

export function initialContentState(kind: ContentKind): ContentState {
  return kind === "document" ? "processing" : "draft";
}

export function canTransitionContent(
  kind: ContentKind,
  from: ContentState,
  to: ContentState,
): boolean {
  const allowed = contentStatesFor(kind);
  if (!allowed.includes(from) || !allowed.includes(to)) return false;
  return CONTENT_TRANSITIONS[from].includes(to);
}

export function assertContentTransition(
  kind: ContentKind,
  from: ContentState,
  to: ContentState,
): void {
  if (!canTransitionContent(kind, from, to)) {
    throw new Error(`illegal content transition for ${kind}: ${from} -> ${to}`);
  }
}

/** Only `indexed` content is recallable (100-kb-model 6, hard filter). */
export function isRecallable(state: ContentState): boolean {
  return state === "indexed";
}

// --- governance state machine -----------------------------------------------

const VERIFICATION_TRANSITIONS: Record<VerificationState, readonly VerificationState[]> = {
  unverified: ["verified"],
  verified: ["stale", "verified"], // interval expiry, or implicit re-verification
  stale: ["verified"],
};

export function canTransitionVerification(
  from: VerificationState,
  to: VerificationState,
): boolean {
  return VERIFICATION_TRANSITIONS[from].includes(to);
}

export interface GovernancePolicy {
  /** Library-level switch. Off by default - governance is opt-in (5.2). */
  enabled: boolean;
  /** Content synced from a connector is exempt unless the library overrides. */
  exemptSyncedContent: boolean;
  intervalDays?: number;
}

export interface GovernanceSubject {
  /** True when the content arrived through a connector rather than upload/api. */
  synced: boolean;
  verificationState: VerificationState;
  verifiedAt?: Date;
}

/**
 * Whether governance applies to this item at all. A library with governance off
 * imposes no burden whatsoever - its content stays `unverified` forever and that
 * is not a defect. Synced content is exempt by default because the truth lives
 * at the source; re-verifying it locally would be theatre.
 */
export function governanceApplies(
  policy: GovernancePolicy,
  subject: Pick<GovernanceSubject, "synced">,
): boolean {
  if (!policy.enabled) return false;
  if (subject.synced && policy.exemptSyncedContent) return false;
  return true;
}

/**
 * Implicit re-verification (the Guru mechanism): a verifier editing the content
 * counts as a review and resets the clock. Returns the state after the edit.
 */
export function onVerifierEdit(subject: GovernanceSubject): VerificationState {
  return subject.verificationState === "unverified" ? "unverified" : "verified";
}

/**
 * Expiry evaluation. Returns the state the subject should hold at `now`.
 * Pure - the caller decides whether to persist it.
 */
export function evaluateExpiry(
  policy: GovernancePolicy,
  subject: GovernanceSubject,
  now: Date,
): VerificationState {
  if (!governanceApplies(policy, subject)) return subject.verificationState;
  if (subject.verificationState !== "verified") return subject.verificationState;
  if (!policy.intervalDays || !subject.verifiedAt) return "verified";
  const dueMs = subject.verifiedAt.getTime() + policy.intervalDays * 86_400_000;
  return now.getTime() >= dueMs ? "stale" : "verified";
}

// --- quality tier (5.3): governance meets retrieval, read-time only ---------

export const VERIFICATION_FILTERS = [
  "verified_only",
  "verified_and_untracked",
  "all",
] as const;
export type VerificationFilter = (typeof VERIFICATION_FILTERS)[number];

export const DEFAULT_VERIFICATION_FILTER: VerificationFilter = "verified_and_untracked";

/**
 * Does an item pass the requested quality tier?
 *
 * The default tier excludes `stale` but keeps `unverified`. That asymmetry is
 * deliberate and is the whole design: enabling governance is a promise to
 * maintain, so letting it lapse costs you recall - while a library that never
 * opted in is not punished for it.
 */
export function passesVerificationFilter(
  filter: VerificationFilter,
  state: VerificationState,
): boolean {
  switch (filter) {
    case "verified_only":
      return state === "verified";
    case "verified_and_untracked":
      return state === "verified" || state === "unverified";
    case "all":
      return true;
  }
}
