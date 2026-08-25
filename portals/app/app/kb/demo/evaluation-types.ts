// Shared response types for GET /api/evaluation - the 验证评测 read model.
// Two orthogonal things live here, deliberately not merged:
//   · 验证治理 (verification): human/AI governance state over the corpus -
//     the verified / stale / unverified split and the re-verification queue;
//   · 评测 (evaluation): retrieval and answer quality measured against a
//     baseline, which is what tells you whether a change helped.

/** Where a group of figures came from on THIS request. `live` = read out of the
 *  database; `demo` = the demo overlay, because no ledger stands behind it yet.
 *  Sections go live one at a time, so the marker is per group, never per page -
 *  a single page-wide flag would have to lie about whichever half moved first. */
export type FigureSource = "live" | "demo";

export interface VerificationState {
  verified: number;
  stale: number;
  unverified: number;
  coveragePct: number;
  /** Coverage percentage below which an asset is listed in `belowFloor`.
   *  Carried in the payload rather than hardcoded in the UI: it is a policy
   *  number, and when a workspace-level policy config lands this is the field
   *  that starts varying. */
  floorPct: number;
  /** Assets whose coverage sits below `floorPct`.
   *
   *  `id` is what makes this a WAY IN rather than a dead end: the row links to
   *  that library's own outstanding work in the re-verification queue. Nullable
   *  because the demo overlay has no real libraries to point at, and a link to
   *  a fabricated id would 404 - a demo row is honestly un-clickable. */
  belowFloor: { id: string | null; name: string; coveragePct: number; staleCount: number }[];
  /** Steward pre-verification waiting on a human decision. Stays on the demo
   *  overlay even when the corpus figures are live - there is no steward
   *  ledger yet (see EvaluationData.sources.steward). */
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
  /** Per-group provenance - see FigureSource. Three groups, because they go
   *  live on three different dependencies:
   *    corpus     verified/stale/unverified/coverage/belowFloor - LIVE off
   *               document.verification_state + entry.verification_state,
   *               which already exist; no DDL was needed.
   *    steward    preVerifiedPending - waits on a steward ledger.
   *    evaluation metrics + sets - waits on the evaluation runner. */
  sources: { corpus: FigureSource; steward: FigureSource; evaluation: FigureSource };
  /** True while the EVALUATION half is the demo overlay. Kept as its own field
   *  (rather than derived) because it is what the page's footnote renders. */
  demoOps: boolean;
}
