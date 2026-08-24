import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import { DEMO_TOTALS_OPS } from "../../kb/demo/seed-data";
import { DEMO_PIPELINE, DEMO_TASKS } from "../../kb/demo/pipeline-demo";
import { DEMO_EVALUATION } from "../../kb/demo/evaluation-demo";
import type { ShellData } from "../../kb/demo/shell-types";

// GET /api/shell - everything the portal chrome needs in one round trip: the
// nav-rail card summaries, the header badge count, the steward dock payload.
// Asset count/coverage are live when a DB is attached; ops figures stay the
// demo overlay (demoOps: true) until the supply ledger and pipeline land -
// derived from the same demo constants as /api/overview and /api/pipeline so
// the chrome can never disagree with the pages it frames.
export const dynamic = "force-dynamic";

const S = DEMO_TOTALS_OPS.steward;

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  let assetCount = 12;
  let coveragePct = 82;
  if (prismaEnabled()) {
    const p = await getPrismaClient();
    const workspaceId = auth.user.activeWorkspace;
    const [kbCount, entryTotal, entryVerified] = await Promise.all([
      p.knowledgeBase.count({ where: { workspaceId, deletedAt: null } }),
      p.entry.count({ where: { knowledgeBase: { workspaceId, deletedAt: null } } }),
      p.entry.count({ where: { knowledgeBase: { workspaceId, deletedAt: null }, verificationState: "verified" } }),
    ]);
    assetCount = kbCount;
    coveragePct = entryTotal === 0 ? 0 : Math.round((entryVerified / entryTotal) * 100);
  }

  const data: ShellData = {
    overview: { assetCount, coveragePct },
    channels: {
      todayCalls: DEMO_TOTALS_OPS.todayCalls,
      deltaPct: DEMO_TOTALS_OPS.deltaPct,
      spark: [35, 30, 45, 40, 60, 52, 70, 62, 82],
    },
    pipeline: {
      pending: S.pending,
      failedResident: DEMO_TASKS.failures.permanent,
      rebuilding: 1,
      inflight: DEMO_TASKS.counts.inflight,
    },
    evaluation: {
      coveragePct: DEMO_EVALUATION.verification.coveragePct,
      stale: DEMO_EVALUATION.verification.stale,
      gaps: DEMO_EVALUATION.sets.reduce((n, s) => n + s.gaps, 0),
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
