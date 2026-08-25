// Demo overlay for 验证评测. Verification figures derive from the seeded
// corpus shape (the same DEMO_ASSETS the overview reads), evaluation figures
// are the demo voice - there is no evaluation runner yet (KD-011 ruled out
// synthetic QA generation for v1, so eval sets are authored, not generated).
import { DEMO_TOTALS_OPS } from "./seed-data";
import type { EvaluationData } from "./evaluation-types";

const S = DEMO_TOTALS_OPS.steward;

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
  baselineLabel: "基线 · bge-m3@v2 · 2026-08-18",
  // The offline default. /api/evaluation overrides `corpus` to "live" whenever
  // a DB is attached - this constant is what the page shows with none.
  sources: { corpus: "demo", steward: "demo", evaluation: "demo" },
  metrics: [
    {
      key: "recall",
      label: "召回命中率",
      value: "0.86",
      delta: "+7.2%",
      deltaTone: "success",
      hint: "评测集问题中,正确证据出现在 top-k 的比例",
    },
    {
      key: "precision",
      label: "引用准确率",
      value: "0.91",
      delta: "+1.4%",
      deltaTone: "success",
      hint: "回答引用的条目里,真正支撑该回答的比例",
    },
    {
      key: "grounded",
      label: "有据回答率",
      value: "0.94",
      delta: "-0.6%",
      deltaTone: "danger",
      hint: "回答完全由检索证据支撑、未自由发挥的比例",
    },
    {
      key: "latency",
      label: "检索 P95",
      value: "412ms",
      delta: "持平",
      deltaTone: "neutral",
      hint: "自请求进入到候选集返回的端到端耗时",
    },
  ],
  sets: [
    { id: "es-bid", name: "投标问答评测集", questionCount: 120, lastRun: "2 小时前", passPct: 88, gaps: 3 },
    { id: "es-ops", name: "设备作业评测集", questionCount: 96, lastRun: "昨天", passPct: 92, gaps: 1 },
    { id: "es-emg", name: "应急预案评测集", questionCount: 64, lastRun: "3 天前", passPct: 74, gaps: 6 },
    { id: "es-reg", name: "法规引用评测集", questionCount: 48, lastRun: "未运行", passPct: 0, gaps: 0 },
  ],
  demoOps: true,
};
