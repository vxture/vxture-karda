// Shared response types for GET /api/evaluation - the 验证评测 read model.
// Two orthogonal things live here, deliberately not merged:
//   · 验证治理 (verification): human/AI governance state over the corpus -
//     the verified / stale / unverified split and the re-verification queue;
//   · 评测 (evaluation): retrieval and answer quality measured against a
//     baseline, which is what tells you whether a change helped.

export interface VerificationState {
  verified: number;
  stale: number;
  unverified: number;
  coveragePct: number;
  /** Assets whose coverage sits below the workspace policy floor. */
  belowFloor: { name: string; coveragePct: number; staleCount: number }[];
  /** Steward pre-verification waiting on a human decision. */
  preVerifiedPending: number;
}

/** One quality metric against its baseline. */
export interface EvalMetric {
  key: string;
  label: string;
  /** Preformatted current reading, e.g. "0.82". */
  value: string;
  /** Signed delta vs the baseline, e.g. "+7.2%". */
  delta: string;
  deltaTone: "success" | "danger" | "neutral";
  /** What this metric means, one line - these terms are not universal. */
  hint: string;
}

/** A stored evaluation set (a question set with expected evidence). */
export interface EvalSet {
  id: string;
  name: string;
  questionCount: number;
  /** Last run, preformatted relative time. */
  lastRun: string;
  passPct: number;
  /** Coverage gaps this set surfaced - questions with no answer in the corpus. */
  gaps: number;
}

export interface EvaluationData {
  verification: VerificationState;
  metrics: EvalMetric[];
  sets: EvalSet[];
  /** Baseline the metrics compare against. */
  baselineLabel: string;
  demoOps: boolean;
}
