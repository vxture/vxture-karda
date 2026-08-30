import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { prismaEnabled } from "../../lib/db";
import { readTasks } from "../../kb/processing/task-read";
import { readWorkspaceKarda } from "../../kb/assertions/workspace-read";
import { DEMO_PIPELINE } from "../../kb/demo/pipeline-demo";

// GET /api/pipeline - the 加工管道 read model.
//
// 可测的数字转真(2026-08-30):今日吞吐与端到端 P95 来自任务账本(task-read,与
// /api/pipeline/tasks 同一读模型),待确认总数来自断言层(workspace-read,与总览
// 卡、确认台同一口径)。此前整个载荷是演示常量,而且文件头写着「加工管线没有
// schema」——那句话在 incr/0004 之后就不再真。
//
// 仍为登记/演示口径的部分,各有各的理由:今日战报与阶段看板的**叙事**是卡尔达的
// 判断,不是聚合;autoRatePct 需要「人工干预了几次」的记录,还没有这份账;提案列表
// 等提案账本。demoOps 说的就是这半边。
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!prismaEnabled()) return NextResponse.json(DEMO_PIPELINE);

  const ws = auth.user.activeWorkspace ?? "";
  const [tasks, karda] = await Promise.all([readTasks(ws), readWorkspaceKarda(ws)]);
  return NextResponse.json({
    ...DEMO_PIPELINE,
    docsToday: tasks.throughput.docsToday,
    p95Seconds: tasks.throughput.p95Seconds,
    pendingTotal: karda.pending,
  });
}
