// Demo overlay for 验证评测. Verification figures derive from the seeded
// corpus shape (the same DEMO_ASSETS the overview reads), evaluation figures
// are the demo voice - there is no evaluation runner yet (KD-011 ruled out
// synthetic QA generation for v1, so eval sets are authored, not generated).
import { DEMO_TOTALS_OPS } from "./seed-data";
import type { EvaluationData } from "./evaluation-types";

const S = DEMO_TOTALS_OPS.agent;

/**
 * A demo timestamp, N hours back from now.
 *
 * NOT a fixed ISO string: the field used to hold a rendered phrase ("2 小时前")
 * which was relative by construction, and replacing it with a literal date made
 * the demo drift - within a day it was reading "in 13 hours", a run that had not
 * happened yet. A demo figure that ages has to be expressed as an age.
 */
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3_600_000).toISOString();

export const DEMO_EVALUATION: EvaluationData = {
  verification: {
    verified: 2617,
    stale: 26,
    unverified: 573,
    coveragePct: 82,
    floorPct: 80,
    // `id: null` throughout - these libraries do not exist, so the rows must
    // stay un-clickable. A fabricated id would render a link that 404s, which is
    // worse than a row that plainly does not lead anywhere.
    belowFloor: [
      { id: null, name: "应急预案库", coveragePct: 61, staleCount: 17 },
      { id: null, name: "会议纪要与决议", coveragePct: 58, staleCount: 9 },
      { id: null, name: "客户与项目档案", coveragePct: 71, staleCount: 0 },
    ],
    preVerifiedPending: S.preVerified,
  },
  baseline: "bge-m3@v2 · 2026-08-18",
  degraded: false,
  // The offline default. /api/evaluation overrides `corpus` to "live" whenever
  // a DB is attached - this constant is what the page shows with none.
  sources: { corpus: "demo", agent: "demo", evaluation: "demo" },
  metrics: [
    {
      key: "recall",
      value: "0.86",
      delta: "+7.2%",
      deltaTone: "success",
    },
    {
      key: "precision",
      value: "0.91",
      delta: "+1.4%",
      deltaTone: "success",
    },
    {
      key: "grounded",
      value: "0.94",
      delta: "-0.6%",
      deltaTone: "danger",
    },
    {
      key: "latency",
      value: "412ms",
      delta: "0.0%",
      deltaTone: "neutral",
    },
  ],
  sets: [
    { id: "es-bid", name: "投标问答评测集", questionCount: 120, lastRun: hoursAgo(2), passPct: 88, gaps: 3 },
    { id: "es-ops", name: "设备作业评测集", questionCount: 96, lastRun: hoursAgo(26), passPct: 92, gaps: 1 },
    { id: "es-emg", name: "应急预案评测集", questionCount: 64, lastRun: hoursAgo(74), passPct: 74, gaps: 6 },
    { id: "es-reg", name: "法规引用评测集", questionCount: 48, lastRun: null, passPct: 0, gaps: 0 },
  ],
  demoOps: true,
};
