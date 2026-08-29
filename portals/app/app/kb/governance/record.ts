// The verification RECORD for one item - and the name is deliberate.
//
// The batch-11 plan called this "verification history on a document", backed by
// `verifier` / `verified_at` / `expires_at`. Those three columns hold exactly ONE
// verification: the latest. Each new verify overwrites them, and the sweep's
// staling overwrites nothing at all (it keeps them as the lapse record). So
// there is no history to show, and a panel labelled 验证历史 over a single row
// would be the same failure the batch's own plan warns about for the agent
// queue - a surface that looks like more than it is.
//
// What the columns DO support is the current record with its clock made
// legible, which is the part an operator actually acts on: not "verified on
// 3 May" but "lapsed 47 days ago" or "expires in 6 days". A real history needs
// an append-only ledger; that is written up as the open question in the batch
// note rather than smuggled in here.

export type RecordUrgency = "none" | "ok" | "soon" | "lapsed";

/**
 * WHICH phrase the clock deserves - not the phrase itself.
 *
 * This module decides the reading (already lapsed and swept? overdue but not
 * yet swept? due today?); the words come from `_i18n/messages/states.ts`. The
 * split is the same one that kept tones here and moved labels out: which of
 * these seven readings applies is a judgement about the data and is identical
 * in every language, whereas the sentence is nothing but language. Returning a
 * ready-made Chinese string would have forced the judgement to be re-made,
 * per locale, by whoever translated it.
 */
export type RecordPhrase =
  | "lapsed"        // swept, no expiry recorded
  | "lapsedDays"    // swept, N days since it lapsed
  | "noInterval"    // verified once, never expires
  | "overdueDays"   // past expiry but the sweep has not run yet
  | "dueToday"
  | "dueDays";

export interface VerificationRecord {
  /** Days until expiry (positive) or since it lapsed (negative). Null when the
   *  item has no clock: never verified, or verified with no interval. */
  days: number | null;
  urgency: RecordUrgency;
  /** Which phrase to render, or null when there is nothing to say. The words
   *  live in the string catalog; see `RecordPhrase`. */
  phrase: RecordPhrase | null;
}

/** Inside this many days of expiry, an item is worth looking at BEFORE it
 *  lapses - the whole point of showing a countdown rather than a date. */
export const EXPIRING_SOON_DAYS = 14;

const DAY_MS = 86_400_000;

/**
 * Describe an item's verification clock.
 *
 * `state` is the stored verification state, which is the authority: an item can
 * be past `expiresAt` and still marked `verified` because the sweep has not run
 * yet. Saying "已过期" for a row the corpus still counts as verified would put
 * the UI ahead of the data - so a lapsed-but-not-yet-swept item reads as
 * lapsed in its COUNTDOWN while its badge keeps saying verified, and running
 * the sweep is what reconciles them. That gap is the reason the sweep button
 * exists on the queue page.
 */
export function verificationRecord(
  state: string,
  verifiedAt: string | Date | null | undefined,
  expiresAt: string | Date | null | undefined,
  now: Date,
): VerificationRecord {
  if (state === "unverified" || !verifiedAt) {
    return { days: null, urgency: "none", phrase: null };
  }

  if (state === "stale") {
    // Already swept. The lapse date is the fact worth showing: it says how long
    // this has been missing from the default recall tier.
    const days = expiresAt ? daysBetween(new Date(expiresAt), now) : null;
    return {
      days,
      urgency: "lapsed",
      phrase: days === null ? "lapsed" : "lapsedDays",
    };
  }

  if (!expiresAt) {
    // Verified with no interval - "verify once, never expires" (policyForKb).
    // There is no clock, so a countdown would invent one.
    return { days: null, urgency: "ok", phrase: "noInterval" };
  }

  const days = daysBetween(new Date(expiresAt), now);
  if (days < 0) {
    return { days, urgency: "lapsed", phrase: "overdueDays" };
  }
  if (days <= EXPIRING_SOON_DAYS) {
    return { days, urgency: "soon", phrase: days === 0 ? "dueToday" : "dueDays" };
  }
  return { days, urgency: "ok", phrase: "dueDays" };
}

/** Whole days from `now` to `target`, truncated TOWARD ZERO.
 *
 *  Not `Math.floor`: for a negative gap floor rounds away from zero, so an item
 *  that expired an hour ago would come back as -1 and render "已过期 1 天" -
 *  claiming a full day that has not passed. Truncation gives 0 at both ends,
 *  which is also what makes a same-day expiry read as 今天到期 rather than as a
 *  countdown of 0. */
function daysBetween(target: Date, now: Date): number {
  // `+ 0` normalises Math.trunc's negative zero. `-0` compares equal to 0 under
  // `===` but not under Object.is or assert.deepEqual, so leaving it in a
  // published field makes a consumer's equality check depend on which
  // comparison they happened to reach for.
  return Math.trunc((target.getTime() - now.getTime()) / DAY_MS) + 0;
}
