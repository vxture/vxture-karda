// The three metrics, as pure functions.
//
// These are the product's stated foundation made checkable: until batch 14 the
// recall hit rate, citation precision and grounded-answer rate on 验证评测 were
// demo constants, so no change to chunking, no model swap and no template edit
// could be shown to have helped or hurt. A number nobody can reproduce is not a
// baseline.
//
// Separated from the runner so the rules below are testable without a database,
// a corpus, or Atlas - which is the only way their edge cases get covered at all.

/** Expected evidence and recalled/cited hits are compared at DOCUMENT level.
 *  Never chunk level: a chunk id is reborn on every rebuild (110-processing's
 *  atomic replace), so a set pinned to chunks would break on exactly the change
 *  it exists to measure. */
export interface QuestionOutcome {
  questionId: string;
  /** Did any expected document appear in what was recalled? */
  recallHit: boolean;
  /** Of the citations the answer actually used, how many were expected. */
  citedExpected: number;
  citedTotal: number;
  /** Did the answer rest on at least one citation? */
  grounded: boolean;
  latencyMs: number | null;
  answerExcerpt: string | null;
}

export interface RunAggregate {
  questionCount: number;
  /** Share of questions whose expected evidence surfaced at all. */
  recallHitPct: number;
  /**
   * MICRO-averaged: total expected citations over total citations, not the mean
   * of per-question ratios. A macro average lets a question that produced one
   * lucky citation outweigh one that produced twenty, which is the opposite of
   * what precision is supposed to say.
   *
   * NULL when nothing was cited anywhere - a run that could not cite has no
   * precision, and reporting 0% would read as "cited the wrong things" when the
   * truth is "did not get to cite at all".
   */
  citationPrecisionPct: number | null;
  /** NULL when answering was not available (Atlas A4 unconfigured). See below. */
  groundedAnswerPct: number | null;
  /** Questions whose expected evidence never surfaced. The rows to go look at. */
  gapCount: number;
}

/** Round to two decimals, matching NUMERIC(5,2) so the stored value and the
 *  computed one are the same number rather than differing in the last place. */
function pct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

/**
 * Aggregate per-question outcomes into a run's headline metrics.
 *
 * `answeringAvailable` is NOT derivable from the outcomes, and that is the point:
 * a run where generation was unconfigured produces zero citations everywhere,
 * which is indistinguishable from a run where generation worked and cited
 * nothing. The first has no grounded-answer rate to report; the second has a
 * rate of 0%. Reporting the first as 0% is how an infrastructure gap gets filed
 * as a quality regression.
 */
export function aggregate(outcomes: QuestionOutcome[], answeringAvailable: boolean): RunAggregate {
  const questionCount = outcomes.length;
  const hits = outcomes.filter((o) => o.recallHit).length;

  const citedTotal = outcomes.reduce((n, o) => n + o.citedTotal, 0);
  const citedExpected = outcomes.reduce((n, o) => n + o.citedExpected, 0);
  const grounded = outcomes.filter((o) => o.grounded).length;

  return {
    questionCount,
    recallHitPct: pct(hits, questionCount),
    citationPrecisionPct: !answeringAvailable || citedTotal === 0 ? null : pct(citedExpected, citedTotal),
    groundedAnswerPct: answeringAvailable ? pct(grounded, questionCount) : null,
    gapCount: questionCount - hits,
  };
}

/** Score one question against what the chain returned. `recalledDocIds` and
 *  `citedDocIds` are already mapped to document level by the caller. */
export function scoreQuestion(input: {
  questionId: string;
  expectedDocIds: readonly string[];
  recalledDocIds: readonly string[];
  citedDocIds: readonly string[];
  latencyMs: number | null;
  answerExcerpt: string | null;
}): QuestionOutcome {
  const expected = new Set(input.expectedDocIds);

  // A question with NO expected evidence cannot be hit or missed - it asserts
  // nothing. Counting it as a miss would let an unfinished set drag the recall
  // rate down and look like a retrieval regression; counting it as a hit would
  // inflate every number. It is excluded upstream (see `answerableQuestions`);
  // reaching here it scores as a non-hit with no citations to judge.
  if (expected.size === 0) {
    return {
      questionId: input.questionId,
      recallHit: false,
      citedExpected: 0,
      citedTotal: input.citedDocIds.length,
      grounded: input.citedDocIds.length > 0,
      latencyMs: input.latencyMs,
      answerExcerpt: input.answerExcerpt,
    };
  }

  const recallHit = input.recalledDocIds.some((id) => expected.has(id));
  // Counted over the citation LIST, not a set: an answer that cites the same
  // wrong document three times is three wrong citations, and de-duplicating
  // would quietly forgive it.
  const citedExpected = input.citedDocIds.filter((id) => expected.has(id)).length;

  return {
    questionId: input.questionId,
    recallHit,
    citedExpected,
    citedTotal: input.citedDocIds.length,
    grounded: input.citedDocIds.length > 0,
    latencyMs: input.latencyMs,
    answerExcerpt: input.answerExcerpt,
  };
}

/** Questions a run can actually score: those asserting some expected evidence.
 *  A set is authored incrementally, so half-written questions are normal and
 *  must not be counted as failures. */
export function answerableQuestions<T extends { expectedEvidence: readonly string[] }>(questions: readonly T[]): T[] {
  return questions.filter((q) => q.expectedEvidence.length > 0);
}

// --- comparison ---------------------------------------------------------------

export type Direction = "better" | "worse" | "flat" | "unknown";

/** All three nullable on BOTH sides. A freshly computed aggregate can carry
 *  nulls (answering unavailable), and so can a stored run row - so the
 *  comparison must accept them rather than have a caller assert them away.
 *  Widening this here is what keeps the "unknown, not flat" rule enforceable at
 *  the type level instead of by convention. */
export interface ComparableMetrics {
  recallHitPct: number | null;
  citationPrecisionPct: number | null;
  groundedAnswerPct: number | null;
}

export interface MetricDelta {
  key: "recallHitPct" | "citationPrecisionPct" | "groundedAnswerPct";
  current: number | null;
  previous: number | null;
  delta: number | null;
  direction: Direction;
}

/** Below this, a move is noise rather than a signal. Two runs of the same set
 *  against the same baseline should read as flat. */
export const FLAT_BAND_PCT = 0.5;

/**
 * The before/after a team can read.
 *
 * A metric that was NULL on either side is `unknown`, not `flat` and not a
 * delta of zero: comparing a measured run against an unmeasured one produces a
 * number that looks like evidence and is not. This is the case that arises
 * whenever a run happened while Atlas A4 was down.
 */
export function compareRuns(current: ComparableMetrics, previous: ComparableMetrics | null): MetricDelta[] {
  const keys = ["recallHitPct", "citationPrecisionPct", "groundedAnswerPct"] as const;
  return keys.map((key) => {
    const cur = current[key];
    const prev = previous ? previous[key] : null;
    if (cur === null || prev === null) {
      return { key, current: cur, previous: prev, delta: null, direction: "unknown" as Direction };
    }
    const delta = Math.round((cur - prev) * 100) / 100;
    const direction: Direction =
      Math.abs(delta) < FLAT_BAND_PCT ? "flat" : delta > 0 ? "better" : "worse";
    return { key, current: cur, previous: prev, delta, direction };
  });
}

/** True when a comparison shows a real regression on any metric - the thing that
 *  is supposed to be visible WITHOUT anyone noticing it by hand. */
export function hasRegression(deltas: readonly MetricDelta[]): boolean {
  return deltas.some((d) => d.direction === "worse");
}
