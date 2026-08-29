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
  /** Agent pre-verification waiting on a human decision. Stays on the demo
   *  overlay even when the corpus figures are live - there is no agent
   *  ledger yet (see EvaluationData.sources.agent). */
  preVerifiedPending: number;
}

/** One quality metric against its baseline. */
export interface EvalMetric {
  key: string;
  /** The metric's name and its one-line explanation come from the catalog,
   *  keyed off `key`. They were authored beside the figures until 2026-08-26. */
  /** Preformatted current reading, e.g. "0.82". */
  value: string;
  /** Signed delta vs the baseline, e.g. "+7.2%". */
  delta: string;
  deltaTone: "success" | "danger" | "neutral";
  /** What this metric means, one line - these terms are not universal. */
}

/** A stored evaluation set (a question set with expected evidence). */
export interface EvalSet {
  id: string;
  name: string;
  questionCount: number;
  /** Last run, preformatted relative time. */
  /** ISO timestamp of the last completed run, or null if it has never run.
   *
   *  It used to be a rendered phrase ("2 小时前" / "未运行") and the client
   *  detected never-run by string-comparing to 「未运行」 - so translating the
   *  phrase would have silently changed program behaviour. A timestamp cannot
   *  do that, and `Intl.RelativeTimeFormat` renders it better than the
   *  hand-rolled version did (it says 昨天 / yesterday where that said 1 天前). */
  lastRun: string | null;
  passPct: number;
  /** Coverage gaps this set surfaced - questions with no answer in the corpus. */
  gaps: number;
}

export interface EvaluationData {
  verification: VerificationState;
  metrics: EvalMetric[];
  sets: EvalSet[];
  /** Baseline the metrics compare against. */
  baseline: string;
  degraded: boolean;
  /** Per-group provenance - see FigureSource. Three groups, because they go
   *  live on three different dependencies:
   *    corpus     verified/stale/unverified/coverage/belowFloor - LIVE off
   *               document.verification_state + entry.verification_state,
   *               which already exist; no DDL was needed.
   *    agent    preVerifiedPending - waits on a agent ledger.
   *    evaluation metrics + sets - waits on the evaluation runner. */
  sources: { corpus: FigureSource; agent: FigureSource; evaluation: FigureSource };
  /** True while the EVALUATION half is the demo overlay. Kept as its own field
   *  (rather than derived) because it is what the page's footnote renders. */
  demoOps: boolean;
}
