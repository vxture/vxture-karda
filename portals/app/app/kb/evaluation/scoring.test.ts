import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  scoreQuestion,
  answerableQuestions,
  compareRuns,
  hasRegression,
  FLAT_BAND_PCT,
  type QuestionOutcome,
} from "./scoring";

const outcome = (over: Partial<QuestionOutcome> = {}): QuestionOutcome => ({
  questionId: "q",
  recallHit: true,
  citedExpected: 1,
  citedTotal: 1,
  grounded: true,
  latencyMs: 100,
  answerExcerpt: null,
  ...over,
});

// --- the NULL-vs-zero distinction, which is the whole point --------------------

test("with answering UNAVAILABLE, grounded rate is NULL - not 0%", () => {
  // A run where generation was unconfigured produces zero citations everywhere,
  // which looks identical to a run that cited nothing. Reporting the first as
  // 0% is how an infrastructure gap gets filed as a quality regression.
  const a = aggregate([outcome({ citedExpected: 0, citedTotal: 0, grounded: false })], false);
  assert.equal(a.groundedAnswerPct, null);
  assert.equal(a.citationPrecisionPct, null);
});

test("with answering AVAILABLE and nothing cited, grounded rate IS 0%", () => {
  // Same outcomes, different meaning. This one really did fail.
  const a = aggregate([outcome({ citedExpected: 0, citedTotal: 0, grounded: false })], true);
  assert.equal(a.groundedAnswerPct, 0);
  assert.equal(a.citationPrecisionPct, null, "no citations at all still has no precision to report");
});

test("precision is NULL when nothing was cited, even with answering available", () => {
  // "cited the wrong things" (0%) and "did not get to cite" (null) are different
  // findings and must not render the same.
  const a = aggregate([outcome({ citedExpected: 0, citedTotal: 0, grounded: false })], true);
  assert.equal(a.citationPrecisionPct, null);
});

// --- micro vs macro averaging -------------------------------------------------

test("precision is MICRO-averaged, so a lucky single citation cannot outweigh twenty", () => {
  // Macro would be (100% + 5%) / 2 = 52.5%. Micro is 1+1 expected out of 1+20
  // cited = 9.52%, which is what precision actually means.
  const a = aggregate(
    [
      outcome({ citedExpected: 1, citedTotal: 1 }),
      outcome({ citedExpected: 1, citedTotal: 20 }),
    ],
    true,
  );
  assert.equal(a.citationPrecisionPct, 9.52);
});

// --- scoring one question -----------------------------------------------------

test("recall hits when ANY expected document surfaces", () => {
  const o = scoreQuestion({
    questionId: "q1",
    expectedDocIds: ["d1", "d2"],
    recalledDocIds: ["d9", "d2"],
    citedDocIds: [],
    latencyMs: null,
    answerExcerpt: null,
  });
  assert.equal(o.recallHit, true);
});

test("recall misses when none surfaces - that is a gap", () => {
  const o = scoreQuestion({
    questionId: "q1",
    expectedDocIds: ["d1"],
    recalledDocIds: ["d7", "d8"],
    citedDocIds: [],
    latencyMs: null,
    answerExcerpt: null,
  });
  assert.equal(o.recallHit, false);
  assert.equal(aggregate([o], true).gapCount, 1);
});

test("repeated wrong citations are counted repeatedly, not de-duplicated", () => {
  // An answer that cites the same wrong document three times made three wrong
  // citations; collapsing them would quietly forgive it.
  const o = scoreQuestion({
    questionId: "q1",
    expectedDocIds: ["d1"],
    recalledDocIds: ["d1"],
    citedDocIds: ["d9", "d9", "d9", "d1"],
    latencyMs: null,
    answerExcerpt: null,
  });
  assert.equal(o.citedTotal, 4);
  assert.equal(o.citedExpected, 1);
  assert.equal(aggregate([o], true).citationPrecisionPct, 25);
});

test("grounded means AT LEAST ONE citation, right or wrong", () => {
  // Grounding and correctness are different questions; conflating them would
  // make an answer with a wrong citation indistinguishable from one with none.
  const wrong = scoreQuestion({
    questionId: "q", expectedDocIds: ["d1"], recalledDocIds: ["d1"],
    citedDocIds: ["d9"], latencyMs: null, answerExcerpt: null,
  });
  assert.equal(wrong.grounded, true);
  assert.equal(wrong.citedExpected, 0);
});

// --- half-written sets --------------------------------------------------------

test("a question asserting NO expected evidence is excluded, not counted as a miss", () => {
  // Sets are authored incrementally, so half-written questions are normal.
  // Counting them as misses would make an unfinished set look like a retrieval
  // regression; counting them as hits would inflate every number.
  const qs = [
    { id: "a", expectedEvidence: ["d1"] },
    { id: "b", expectedEvidence: [] },
  ];
  assert.deepEqual(answerableQuestions(qs).map((q) => q.id), ["a"]);
});

test("an empty run aggregates to zeroes rather than NaN", () => {
  const a = aggregate([], true);
  assert.equal(a.questionCount, 0);
  assert.equal(a.recallHitPct, 0);
  assert.equal(a.gapCount, 0);
});

// --- rounding matches the column ---------------------------------------------

test("percentages round to two decimals, matching NUMERIC(5,2)", () => {
  // Otherwise the stored value and the computed one differ in the last place and
  // a run compared against itself shows a delta.
  const a = aggregate([outcome(), outcome(), outcome({ recallHit: false })], true);
  assert.equal(a.recallHitPct, 66.67);
});

// --- comparison ---------------------------------------------------------------

test("a small move reads as FLAT, not as a signal", () => {
  const d = compareRuns({ recallHitPct: 80.2, citationPrecisionPct: 90, groundedAnswerPct: 95 },
                        { recallHitPct: 80.0, citationPrecisionPct: 90, groundedAnswerPct: 95 });
  assert.equal(d[0].direction, "flat");
  assert.ok(Math.abs(d[0].delta ?? 0) < FLAT_BAND_PCT);
});

test("a real drop reads as WORSE and trips the regression flag", () => {
  const d = compareRuns({ recallHitPct: 71, citationPrecisionPct: 90, groundedAnswerPct: 95 },
                        { recallHitPct: 86, citationPrecisionPct: 90, groundedAnswerPct: 95 });
  assert.equal(d[0].direction, "worse");
  assert.equal(d[0].delta, -15);
  assert.equal(hasRegression(d), true);
});

test("comparing a MEASURED run against an UNMEASURED one is `unknown`, not flat", () => {
  // This arises whenever a run happened while Atlas A4 was down. A delta here
  // would look like evidence and would not be.
  const d = compareRuns({ recallHitPct: 80, citationPrecisionPct: 90, groundedAnswerPct: 95 },
                        { recallHitPct: 80, citationPrecisionPct: null, groundedAnswerPct: null });
  assert.equal(d[1].direction, "unknown");
  assert.equal(d[1].delta, null);
  assert.equal(d[2].direction, "unknown");
  assert.equal(hasRegression(d), false, "an unknown must never be reported as a regression");
});

test("with no previous run at all, everything is unknown", () => {
  const d = compareRuns({ recallHitPct: 80, citationPrecisionPct: 90, groundedAnswerPct: 95 }, null);
  assert.ok(d.every((x) => x.direction === "unknown"));
  assert.equal(hasRegression(d), false);
});

test("an improvement is never reported as a regression", () => {
  const d = compareRuns({ recallHitPct: 95, citationPrecisionPct: 95, groundedAnswerPct: 99 },
                        { recallHitPct: 80, citationPrecisionPct: 90, groundedAnswerPct: 95 });
  assert.ok(d.every((x) => x.direction === "better"));
  assert.equal(hasRegression(d), false);
});
