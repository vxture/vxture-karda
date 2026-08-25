import test from "node:test";
import assert from "node:assert/strict";
import { verificationRecord, EXPIRING_SOON_DAYS } from "./record";

const NOW = new Date("2026-08-25T12:00:00Z");
const at = (iso: string) => new Date(iso);

test("an unverified item has no clock, so it says nothing", () => {
  // A countdown here would be invented - there is no verification to count from.
  const r = verificationRecord("unverified", null, null, NOW);
  assert.equal(r.phrase, null);
  assert.equal(r.days, null);
  assert.equal(r.urgency, "none");
});

test("a stale item leads with HOW LONG it has been lapsed", () => {
  // That is the fact the operator acts on: it says how long this has been
  // quietly missing from the default recall tier.
  const r = verificationRecord("stale", at("2026-05-01T12:00:00Z"), at("2026-07-26T12:00:00Z"), NOW);
  assert.equal(r.urgency, "lapsed");
  assert.equal(r.days, -30);
  assert.equal(r.phrase, "lapsedDays");
  assert.equal(r.days, -30);
});

test("a stale item with no expiry date still reads as lapsed", () => {
  // Possible when the interval was cleared after the item went stale.
  const r = verificationRecord("stale", at("2026-05-01T12:00:00Z"), null, NOW);
  assert.equal(r.urgency, "lapsed");
  assert.equal(r.days, null);
  assert.equal(r.phrase, "lapsed");
});

test("verified with NO interval says so instead of counting down", () => {
  // policyForKb: a null interval means verify once, never expires. Showing a
  // countdown would fabricate a deadline the library deliberately did not set.
  const r = verificationRecord("verified", at("2026-01-01T12:00:00Z"), null, NOW);
  assert.equal(r.urgency, "ok");
  assert.equal(r.days, null);
  assert.equal(r.phrase, "noInterval");
});

test("an approaching expiry is flagged BEFORE it lapses", () => {
  const r = verificationRecord("verified", at("2026-06-01T12:00:00Z"), at("2026-09-01T12:00:00Z"), NOW);
  assert.equal(r.days, 7);
  assert.equal(r.urgency, "soon");
  assert.equal(r.phrase, "dueDays");
  assert.equal(r.days, 7);
});

test("expiring today reads as today, not as 0 天后", () => {
  const r = verificationRecord("verified", at("2026-06-01T12:00:00Z"), at("2026-08-25T20:00:00Z"), NOW);
  assert.equal(r.days, 0);
  assert.equal(r.phrase, "dueToday");
});

test("a comfortable expiry is ok, not soon", () => {
  const r = verificationRecord("verified", at("2026-06-01T12:00:00Z"), at("2026-12-01T12:00:00Z"), NOW);
  assert.equal(r.urgency, "ok");
  assert.ok((r.days ?? 0) > EXPIRING_SOON_DAYS);
});

test("the soon/ok boundary is inclusive at the threshold", () => {
  const boundary = new Date(NOW.getTime() + EXPIRING_SOON_DAYS * 86_400_000);
  assert.equal(verificationRecord("verified", at("2026-01-01T12:00:00Z"), boundary, NOW).urgency, "soon");
  const past = new Date(boundary.getTime() + 86_400_000);
  assert.equal(verificationRecord("verified", at("2026-01-01T12:00:00Z"), past, NOW).urgency, "ok");
});

test("STILL `verified` but past its date: the countdown says lapsed, the state is left alone", () => {
  // The sweep has not run yet. The UI must not get ahead of the data - the
  // stored state is what the corpus counts, so this reads as awaiting the sweep
  // rather than claiming a staling that has not happened.
  const r = verificationRecord("verified", at("2026-01-01T12:00:00Z"), at("2026-08-01T12:00:00Z"), NOW);
  assert.equal(r.urgency, "lapsed");
  assert.equal(r.days, -24);
  assert.equal(r.phrase, "overdueDays");
});

test("an expiry an hour ago is 0 days lapsed, not 1", () => {
  // Math.floor would round a negative gap AWAY from zero and claim a full day
  // that has not passed. Truncation toward zero is the honest reading.
  const r = verificationRecord("stale", at("2026-01-01T12:00:00Z"), at("2026-08-25T11:00:00Z"), NOW);
  assert.equal(r.days, 0);
  assert.equal(r.phrase, "lapsedDays");
  assert.equal(r.days, 0, "an hour past expiry is zero whole days, not one");
});

test("an expiry in eight hours is 今天到期, not a countdown of 0", () => {
  const r = verificationRecord("verified", at("2026-01-01T12:00:00Z"), at("2026-08-25T20:00:00Z"), NOW);
  assert.equal(r.days, 0);
  assert.equal(r.phrase, "dueToday");
});

test("ISO strings and Date objects are accepted alike - the API sends strings", () => {
  const fromString = verificationRecord("verified", "2026-06-01T12:00:00Z", "2026-09-01T12:00:00Z", NOW);
  const fromDate = verificationRecord("verified", at("2026-06-01T12:00:00Z"), at("2026-09-01T12:00:00Z"), NOW);
  assert.deepEqual(fromString, fromDate);
});
