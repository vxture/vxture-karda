// Atlas's error vocabulary, and karda's policy over it.
//
// These are two different things and the split is the whole point.
//
//   THE VOCABULARY is Atlas's. It comes from their published contract
//   (`GET /.well-known/vxture-contract`, vendored here as contract.snapshot.json)
//   and karda does not get an opinion about it. Which codes exist, and which
//   ones Atlas considers retryable, are facts we read.
//
//   THE POLICY is ours. Which codes park a task, which burn a retry, which fail
//   visibly - Atlas cannot decide that, because it depends on what karda does
//   when the call fails, not on what went wrong upstream.
//
// Keeping the vocabulary hand-copied is what produced `#100`: karda branched on
// `QUOTA_EXHAUSTED`, a code that has never existed - the real one is
// `QUOTA_EXCEEDED`. It type-checked, it passed review, and it was dead code
// guarding the one path it was written for. `vxture-atlas#21` asked for a
// machine-readable table precisely so that could not happen again; this file is
// karda's side of that, and `check-atlas-contract.mjs` is what makes it bite.

import snapshot from "./contract.snapshot.json";

export interface ContractCode {
  code: string;
  retryable: boolean;
}

export interface AtlasContract {
  fingerprint: string;
  errorCodes: ContractCode[];
  requests: Record<string, { kind: string; fields: string[]; code: string }[]>;
}

export const ATLAS_CONTRACT = snapshot as AtlasContract;

/**
 * The fingerprint of the snapshot in this repo.
 *
 * NOT pinned, and deliberately not compared against what production serves.
 * Atlas asked us not to pin yet (`#21`): a fix of theirs was moving the
 * fingerprint while we were reading it, and a pin would have failed CI over a
 * value that was correct yesterday and correct tomorrow. What this constant is
 * for is provenance - it says which published version these codes came from, so
 * a refresh is a reviewable diff rather than an unexplained edit.
 */
export const SNAPSHOT_FINGERPRINT = ATLAS_CONTRACT.fingerprint;

/** Every code Atlas publishes. */
export const ATLAS_CODES: ReadonlySet<string> = new Set(ATLAS_CONTRACT.errorCodes.map((c) => c.code));

/** The ones Atlas marks retryable. Four, at the fingerprint above. */
export const ATLAS_RETRYABLE: ReadonlySet<string> = new Set(
  ATLAS_CONTRACT.errorCodes.filter((c) => c.retryable).map((c) => c.code),
);

/**
 * Codes where waiting cannot help but a grant, a quota reset or an operator can.
 *
 * KARDA'S POLICY, not Atlas's - the contract has no field for it, because it is
 * a statement about what we do, not about what happened. Every member is checked
 * against the vocabulary at build time, so a typo here is a failed CI run rather
 * than a branch that never fires.
 *
 * All of them suspend. `QUOTA_EXCEEDED` is separated from the rest at the call
 * site (a quota comes back on its own; an ungranted capability comes back when
 * someone chases the grant) - see FailureClass.
 *
 * `TASK_PROFILE_NOT_ROUTABLE` is deliberately ABSENT even though Atlas still
 * publishes it. It belongs to the legacy tenant axis, and karda sends only
 * `endpointCode` now - so that code can never come back, and a branch that can
 * never fire is exactly the shape of the `#100` defect this file exists to
 * prevent. `check-atlas-contract.mjs` keeps it out.
 */
export const SUSPEND_CODES: ReadonlySet<string> = new Set([
  "QUOTA_EXCEEDED",
  "NOT_ENTITLED",
  "MODEL_NOT_IMPLEMENTED",
  "MODEL_NOT_ROUTABLE",
  "ENDPOINT_NOT_ROUTABLE",
]);

/**
 * Does this code park the work?
 *
 * `retryable` from the contract wins first: Atlas saying a code is retryable is
 * a fact about the upstream, and parking something they told us to retry would
 * strand work that would have succeeded on its own.
 */
export function shouldSuspend(code: string, retryable: boolean): boolean {
  if (retryable) return false;
  return SUSPEND_CODES.has(code);
}

/** Is this a code Atlas actually publishes? Used by the guardrail, and worth
 *  having at runtime too: an unknown code means the contract moved under us. */
export function isKnownAtlasCode(code: string): boolean {
  return ATLAS_CODES.has(code);
}
