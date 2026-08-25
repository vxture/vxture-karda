import { getPrismaClient } from "../../lib/db";
import { compareRuns, type ComparableMetrics } from "./scoring";
import type { EvalMetric, EvalSet } from "../demo/evaluation-types";

// The 质量评测 half of 验证评测, read off real runs.
//
// Until batch 14 these three numbers were demo constants, which meant the page
// asserted a quality baseline the product could not produce. Now they come from
// the most recent COMPLETED run per set, and a workspace that has never run a
// set gets NULL from here - the caller keeps the overlay and says `demo`, rather
// than borrowing a number.
//
// A running or failed run is not a reading. Only `completed` counts.

export interface QualityRead {
  metrics: EvalMetric[];
  sets: EvalSet[];
  /** The run's baseline name, and whether that run degraded. Composed into a
   *  sentence at the CALL SITE - it used to be concatenated here, which put
   *  "· 链路降级" on the wire as prose. */
  baseline: string;
  degraded: boolean;
}

// WHICH three metrics, and which stored field each reads. Their names and
// one-line explanations live in `_i18n/messages/evaluation.ts` - they were
// authored here too until 2026-08-26, which made a fixed list of three exist
// twice.
const METRIC_META = [
  { key: "recall", field: "recallHitPct" as const },
  { key: "precision", field: "citationPrecisionPct" as const },
  { key: "grounded", field: "groundedAnswerPct" as const },
];

/** A percentage the runner could not measure renders as an em dash, never as a
 *  number. "Not measured" and "measured at zero" are different findings. */
function fmt(v: number | null): string {
  return v === null ? "—" : `${v.toFixed(1)}%`;
}

export async function readQuality(workspaceId: string, now: number = Date.now()): Promise<QualityRead | null> {
  const p = await getPrismaClient();

  const sets = await p.evalSet.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "asc" },
    include: {
      _count: { select: { questions: true } },
      runs: { where: { state: "completed" }, orderBy: { startedAt: "desc" }, take: 2 },
    },
  });
  if (sets.length === 0) return null;

  const withRuns = sets.filter((s) => s.runs.length > 0);
  // Sets exist but none has ever been run: still nothing measured. The page
  // keeps the overlay and its `demo` marker rather than showing empty metrics
  // under a live badge.
  if (withRuns.length === 0) return null;

  // The HEADLINE metrics come from the single most recent run across the
  // workspace, compared against that same set's previous run. Averaging across
  // sets would blend different question populations into one number that
  // describes none of them.
  const latest = withRuns
    .flatMap((s) => s.runs.map((r) => ({ set: s, run: r })))
    .sort((a, b) => b.run.startedAt.getTime() - a.run.startedAt.getTime())[0];

  const asMetrics = (r: { recallHitPct: unknown; citationPrecisionPct: unknown; groundedAnswerPct: unknown }): ComparableMetrics => ({
    recallHitPct: r.recallHitPct === null ? null : Number(r.recallHitPct),
    citationPrecisionPct: r.citationPrecisionPct === null ? null : Number(r.citationPrecisionPct),
    groundedAnswerPct: r.groundedAnswerPct === null ? null : Number(r.groundedAnswerPct),
  });

  const current = asMetrics(latest.run);
  const prior = latest.set.runs[1] ? asMetrics(latest.set.runs[1]) : null;
  const deltas = compareRuns(current, prior);

  const metrics: EvalMetric[] = METRIC_META.map((m) => {
    const d = deltas.find((x) => x.key === m.field);
    return {
      key: m.key,
      value: fmt(current[m.field]),
      // An unknown delta is a dash, not "+0.0%". A zero would claim the metric
      // held steady across a comparison that never happened.
      delta: d?.delta === null || d === undefined ? "—" : `${d.delta > 0 ? "+" : ""}${d.delta.toFixed(1)}%`,
      deltaTone: d?.direction === "better" ? "success" : d?.direction === "worse" ? "danger" : "neutral",
    };
  });

  return {
    metrics,
    baseline: latest.run.baselineLabel,
    degraded: latest.run.degraded,
    sets: sets.map((s) => {
      const last = s.runs[0];
      return {
        id: s.id,
        name: s.name,
        questionCount: s._count.questions,
        lastRun: last?.startedAt.toISOString() ?? null,
        // passPct is the RECALL rate: "did the corpus contain what the question
        // needed". It is the one metric measurable without generation, so it is
        // the only honest per-set headline on a host where answering is off.
        passPct: last?.recallHitPct === null || last === undefined ? 0 : Math.round(Number(last.recallHitPct)),
        gaps: last?.gapCount ?? 0,
      };
    }),
  };
}
