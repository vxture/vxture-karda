import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import { DEMO_ASSETS, DEMO_TOTALS_OPS } from "../../kb/demo/seed-data";
import { DEMO_PIPELINE, DEMO_TASKS } from "../../kb/demo/pipeline-demo";
import { DEMO_EVALUATION } from "../../kb/demo/evaluation-demo";
import { readCorpus } from "../../kb/governance/corpus-read";
import type { ShellData } from "../../kb/demo/shell-types";

// GET /api/shell - everything the portal chrome needs in one round trip: the
// 导航栏 card summaries, the header badge count, the 值班台 payload.
// Asset/entry counts and the 7-day intake are live when a DB is attached; ops
// figures stay the demo overlay (demoOps: true) until the supply ledger and
// pipeline land - derived from the same demo constants as /api/overview and
// /api/pipeline so the chrome can never disagree with the pages it frames.
export const dynamic = "force-dynamic";

const S = DEMO_TOTALS_OPS.steward;

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  // Offline baseline: the SAME reduction /api/overview does over DEMO_ASSETS,
  // not a second hand-written figure - the nav card must never contradict the
  // page head it sits beside.
  const demoGoverned = DEMO_ASSETS.reduce((n, a) => n + a.entryCount + a.docCount, 0);
  let assetCount = DEMO_ASSETS.length;
  let entryCount = demoGoverned;
  let weeklyNew = 137;
  if (prismaEnabled()) {
    const p = await getPrismaClient();
    const workspaceId = auth.user.activeWorkspace;
    const scope = { knowledgeBase: { workspaceId, deletedAt: null } };
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [kbCount, entryTotal, entryFresh] = await Promise.all([
      p.knowledgeBase.count({ where: { workspaceId, deletedAt: null } }),
      p.entry.count({ where: scope }),
      p.entry.count({ where: { ...scope, createdAt: { gte: since } } }),
    ]);
    assetCount = kbCount;
    entryCount = entryTotal;
    weeklyNew = entryFresh;
  }
  // Problem figure for the asset domain: assets the overview page paints as
  // 需关注 / 有缺口 (health is the demo ops overlay, so this one stays there
  // even when the counts above go live).
  const needsAttention = DEMO_ASSETS.filter(
    (a) => a.ops.health === "attention" || a.ops.health === "gap",
  ).length;

  const evalGaps = DEMO_EVALUATION.sets.reduce((n, s) => n + s.gaps, 0);
  // The 验证评测 card reads the SAME corpus function /api/evaluation reads, so
  // the card and the page it frames cannot report different coverage. `gaps`
  // stays demo - it comes from the evaluation sets, which have no runner yet.
  const V = prismaEnabled()
    ? await readCorpus(auth.user.activeWorkspace)
    : DEMO_EVALUATION.verification;

  const data: ShellData = {
    overview: { assetCount, entryCount, weeklyNew, needsAttention },
    channels: {
      directCalls: DEMO_TOTALS_OPS.directCalls,
      runosCalls: DEMO_TOTALS_OPS.runosCalls,
      todayCalls: DEMO_TOTALS_OPS.todayCalls,
      deltaPct: DEMO_TOTALS_OPS.deltaPct,
      degraded: 1,
    },
    pipeline: {
      inflight: DEMO_TASKS.counts.inflight,
      pending: S.pending,
      failedResident: DEMO_TASKS.failures.permanent,
      docsToday: DEMO_TASKS.throughput.docsToday,
      rebuilding: 1,
    },
    evaluation: {
      verified: V.verified,
      stale: V.stale,
      unverified: V.unverified,
      coveragePct: V.coveragePct,
      gaps: evalGaps,
    },
    steward: {
      pending: S.pending,
      proposals: DEMO_PIPELINE.proposals.slice(0, 2),
      alert: DEMO_TASKS.alert
        ? {
            text: `「${DEMO_TASKS.alert.kbName}」失败率 ${DEMO_TASKS.alert.rate.replace(" > ", " 超 ")}——管家判断:模板选错`,
            href: "/pipeline/tasks",
          }
        : null,
      activity: [
        { time: "14:32", agent: "forge", text: "沉淀投标问答 12 条,管家萃取中" },
        { time: "14:18", agent: "raven", text: "引用《设备作业手册》46 次(早班峰值)" },
        { time: "13:55", text: "管家完成 GB 51427 差异比对,生成更新提案" },
        { time: "13:41", agent: "anlan", text: "查「华东区验收纪要」未命中 → 记为缺口" },
      ],
    },
    demoOps: true,
  };
  return NextResponse.json(data);
}
