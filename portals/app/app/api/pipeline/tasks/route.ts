import { NextResponse } from "next/server";
import { requireAuth } from "../../../kb/api/http";
import { prismaEnabled } from "../../../lib/db";
import { readTasks } from "../../../kb/processing/task-read";
import { DEMO_TASKS } from "../../../kb/demo/pipeline-demo";
import type { TasksData } from "../../../kb/demo/pipeline-types";

// GET /api/pipeline/tasks - the 任务与队列 read model.
//
// TASKS are live off karda_kb.processing_task(+_stage), written by
// kb/processing/task-ledger.ts at enqueue and at every worker outcome. Until
// that ledger existed the runtime ran and left nothing behind, so this page had
// no data source at all.
//
// OPS stays authored, and that is the honest answer rather than a gap:
//   · freshness P95 - nothing in the pipeline measures content age against
//     index age, so there is no figure to derive;
//   · the org and per-tier concurrency caps - configuration, not facts;
//   · the agent's JUDGMENT on a failure-rate alert - an opinion. The RATE and
//     the library are computed; the judgment is not invented to match.
export const dynamic = "force-dynamic";

/** Depth bar fill. Relative to the largest queue rather than an absolute cap:
 *  the caps are per-tier config we do not read, and a bar scaled to a number we
 *  are guessing at is worse than one scaled to the data. */
function depthPct(queued: number, max: number): number {
  return max === 0 ? 0 : Math.round((queued / max) * 100);
}

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!prismaEnabled()) {
    return NextResponse.json({ ...DEMO_TASKS, sources: { tasks: "demo", ops: "demo" } } satisfies TasksData);
  }

  const t = await readTasks(auth.user.activeWorkspace);
  const maxQueued = Math.max(t.tierQueued.interactive, t.tierQueued.sync, t.tierQueued.bulk);

  const data: TasksData = {
    ...DEMO_TASKS,
    counts: t.counts,
    throughput: {
      ...t.throughput,
      // Authored: see the header note. Kept from the overlay rather than
      // computed from something that does not measure it.
      freshnessP95Min: DEMO_TASKS.throughput.freshnessP95Min,
    },
    queueDepth: t.queueDepth,
    failures: t.failures,
    stageP95: t.stageP95,
    // Tier labels and concurrency strings are configuration; only the depth is
    // measured.
    tiers: DEMO_TASKS.tiers.map((tier) => ({
      ...tier,
      queued: t.tierQueued[tier.key],
      pct: depthPct(t.tierQueued[tier.key], maxQueued),
    })),
    alert: t.alert
      ? {
          kbName: t.alert.kbName,
          rate: `${t.alert.ratePct}% > 30%`,
          body: `近 24h 失败 ${t.alert.failed}/${t.alert.total}。`,
          // No judgment when the alert is derived. The agent has not looked at
          // this one, and printing a plausible-sounding cause it never formed
          // would be the single most misleading thing on the page.
          judgment: "",
        }
      : null,
    tasks: t.tasks,
    sources: { tasks: "live", ops: "demo" },
    demoOps: false,
  };
  return NextResponse.json(data);
}
