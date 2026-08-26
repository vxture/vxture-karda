import { getPrismaClient } from "../../lib/db";
import type { ProcessingStage, StageDot, QueueTier, PipelineTask } from "../demo/pipeline-types";
import type { Stage } from "./stages";

// The 加工管道 read model (240-ops-read-models section 4.1/4.2), reading the rows
// task-ledger.ts writes. Until that ledger existed this page had no data source
// at all - the runtime ran and left nothing behind.
//
// Same shape as supply-read.ts: aggregation is a PURE function over rows so the
// edge cases are testable without a database, and the query is a single bounded
// read. 240 section 6 covers when this has to stop being in-process.
//
// What this file does NOT compute, deliberately: freshness P95 (nothing here
// measures content age vs index age), the org concurrency cap and the per-tier
// concurrency labels (configuration, not facts), and the steward's judgment on a
// failure-rate alert (an opinion, not an aggregate). Those stay authored and the
// payload's `sources` marker says so - a half-derived alert that invents a
// judgment would be worse than an honest authored one.

const WINDOW_HOURS = 48;
const ROW_CAP = 20_000;
const TASK_LIST_LIMIT = 12;

/** The five pipeline stages in order - the dot row's spine. */
export const STAGES: Stage[] = ["fetch", "parse", "chunk", "embed", "commit"];

export interface TaskStageRow {
  stage: string;
  outcome: string | null;
  startedAt: Date;
  endedAt: Date | null;
}

export interface TaskRow {
  id: string;
  documentId: string;
  kbId: string;
  kbName: string;
  documentTitle: string;
  tier: string;
  state: string;
  currentStage: string;
  failureClass: string | null;
  failureReason: string | null;
  attempt: number;
  createdInProduct: string | null;
  queuedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  stages: TaskStageRow[];
}

export interface TaskTally {
  counts: { inflight: number; suspended: number; failed: number };
  throughput: { docsToday: number; p95Seconds: number; docsPerMin: number };
  queueDepth: { interactive: number; sync: number; bulk: number };
  failures: { transient: number; permanent: number; quota: number; unavailable: number };
  stageP95: [number, number, number, number, number];
  tierQueued: Record<QueueTier["key"], number>;
  tasks: PipelineTask[];
  /** Worst library by 24h failure rate, when there is one worth showing. */
  alert: { kbName: string; failed: number; total: number; ratePct: number } | null;
}

function p95Of(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(Math.ceil(0.95 * sorted.length), sorted.length) - 1];
}

/**
 * The five progress dots for one task.
 *
 * Derived from the stage rows plus the task's own state - never stored. A stored
 * dots array would be a second copy of the truth that nothing keeps in sync
 * (240 section 4.2).
 */
export function dotsFor(row: {
  state: string;
  currentStage: string;
  stages: { stage: string; outcome: string | null }[];
}): [StageDot, StageDot, StageDot, StageDot, StageDot] {
  const byStage = new Map(row.stages.map((s) => [s.stage, s.outcome]));
  const currentIdx = STAGES.indexOf(row.currentStage as Stage);
  const dots = STAGES.map((stage, i): StageDot => {
    const outcome = byStage.get(stage);
    if (outcome === "failed") return "fail";
    if (outcome === "ai_assisted") return "ai";
    if (outcome === "ok" || outcome === "skipped") return "done";
    if (i === currentIdx) {
      // Reached but not closed. A suspended task is parked mid-stage - `warn`,
      // not `active`: nothing is moving, and showing it as active would make a
      // parked fleet look busy.
      if (row.state === "running") return "active";
      if (row.state === "suspended") return "warn";
      if (row.state === "failed") return "fail";
      return "todo";
    }
    return "todo";
  });
  return dots as [StageDot, StageDot, StageDot, StageDot, StageDot];
}

/**
 * WHAT a task row is doing, and how loud to paint it.
 *
 * It used to return a finished Chinese sentence built from `currentStage` - a
 * CODE - so the live path rendered "fetch 处理中". Returning the shape lets the
 * call site say it properly in whatever language the reader chose.
 */
export function statusFor(row: TaskRow): Pick<PipelineTask, "status" | "statusTone"> {
  const stage = row.currentStage as ProcessingStage;
  switch (row.state) {
    case "running":
      return { status: { kind: "running", stage }, statusTone: "primary" };
    case "queued":
      return row.attempt > 1
        ? { status: { kind: "retrying", attempt: row.attempt }, statusTone: "muted" }
        : { status: { kind: "queued" }, statusTone: "muted" };
    case "suspended":
      // Quota/unavailable parks the task; it resumes on its own, so this is not
      // an error state and must not be painted as one.
      return {
        status: {
          kind:
            row.failureClass === "quota"
              ? "suspendedQuota"
              : row.failureClass === "unavailable"
                ? "suspendedUnavailable"
                : "suspendedOther",
        },
        statusTone: "warning",
      };
    case "failed":
      return { status: { kind: "failed", stage }, statusTone: "danger" };
    default:
      return { status: { kind: "committed" }, statusTone: "muted" };
  }
}

/** Pure aggregation. `now` is injected so day boundaries are deterministic. */
export function tallyTasks(rows: TaskRow[], now: number): TaskTally {
  const dayMs = 86_400_000;
  const live = rows.filter((r) => r.state === "queued" || r.state === "running");
  const suspended = rows.filter((r) => r.state === "suspended");
  const failed = rows.filter((r) => r.state === "failed");
  const doneToday = rows.filter(
    (r) => r.state === "done" && r.finishedAt !== null && now - r.finishedAt.getTime() < dayMs,
  );

  const tierQueued: TaskTally["tierQueued"] = { interactive: 0, sync: 0, bulk: 0 };
  for (const r of live) {
    if (r.tier === "interactive" || r.tier === "sync" || r.tier === "bulk") tierQueued[r.tier] += 1;
  }

  const failures = { transient: 0, permanent: 0, quota: 0, unavailable: 0 };
  for (const r of [...failed, ...suspended]) {
    if (r.failureClass && r.failureClass in failures) {
      failures[r.failureClass as keyof typeof failures] += 1;
    }
  }

  // End-to-end seconds, queued to finished - what a user waits, not what the
  // pipeline spends. Those differ by the queue, and the queue is the part that
  // gets slow first.
  const durations = doneToday
    .filter((r) => r.finishedAt)
    .map((r) => (r.finishedAt!.getTime() - r.queuedAt.getTime()) / 1000);

  const stageP95 = STAGES.map((stage) => {
    const secs: number[] = [];
    for (const r of rows) {
      for (const s of r.stages) {
        if (s.stage === stage && s.endedAt) secs.push((s.endedAt.getTime() - s.startedAt.getTime()) / 1000);
      }
    }
    return Math.round(p95Of(secs) * 10) / 10;
  }) as [number, number, number, number, number];

  // Throughput over the last hour, not today divided by 1440: a burst an hour
  // ago and a steady trickle produce very different operations pictures, and
  // dividing the day flattens both into the same number.
  const lastHour = rows.filter(
    (r) => r.state === "done" && r.finishedAt !== null && now - r.finishedAt.getTime() < 3_600_000,
  ).length;

  // 24h failure rate by library. Only surfaced above a floor of attempts -
  // 1 failure out of 1 is 100% and means nothing.
  const byKb = new Map<string, { name: string; failed: number; total: number }>();
  for (const r of rows) {
    if (!r.finishedAt || now - r.finishedAt.getTime() >= dayMs) continue;
    let e = byKb.get(r.kbId);
    if (!e) {
      e = { name: r.kbName, failed: 0, total: 0 };
      byKb.set(r.kbId, e);
    }
    e.total += 1;
    if (r.state === "failed") e.failed += 1;
  }
  const ALERT_MIN_TOTAL = 5;
  const ALERT_FLOOR_PCT = 30;
  const worst = [...byKb.values()]
    .filter((e) => e.total >= ALERT_MIN_TOTAL)
    .map((e) => ({ kbName: e.name, failed: e.failed, total: e.total, ratePct: Math.round((e.failed / e.total) * 100) }))
    .sort((a, b) => b.ratePct - a.ratePct || (a.kbName < b.kbName ? -1 : 1))[0];

  const tasks: PipelineTask[] = rows
    .filter((r) => r.state !== "done")
    .sort((a, b) => b.queuedAt.getTime() - a.queuedAt.getTime())
    .slice(0, TASK_LIST_LIMIT)
    .map((r) => ({
      id: r.id.slice(0, 8),
      title: r.documentTitle,
      detail: [r.kbName, r.tier, r.attempt > 1 ? `#${r.attempt}` : null].filter(Boolean).join(" · "),
      dots: dotsFor(r),
      ...statusFor(r),
      // Derived, never a stored boolean (240 section 4.1): a deposit is a write
      // that came from somewhere other than karda itself.
      agentDeposit: r.createdInProduct !== null && r.createdInProduct !== "karda",
    }));

  return {
    counts: { inflight: live.length, suspended: suspended.length, failed: failed.length },
    throughput: {
      docsToday: doneToday.length,
      p95Seconds: Math.round(p95Of(durations) * 10) / 10,
      docsPerMin: Math.round((lastHour / 60) * 10) / 10,
    },
    queueDepth: { ...tierQueued },
    failures,
    stageP95,
    tierQueued,
    tasks,
    alert: worst && worst.ratePct >= ALERT_FLOOR_PCT ? worst : null,
  };
}

/** Read the window out of the ledger. Caller must have checked prismaEnabled(). */
export async function readTasks(workspaceId: string, now: number = Date.now()): Promise<TaskTally> {
  const p = await getPrismaClient();
  const since = new Date(now - WINDOW_HOURS * 3_600_000);
  const rows = await p.processingTask.findMany({
    where: {
      knowledgeBase: { workspaceId, deletedAt: null },
      // Live work regardless of age, plus anything that finished in the window -
      // a task parked for three days is still the operator's problem today.
      OR: [{ state: { in: ["queued", "running", "suspended"] } }, { finishedAt: { gte: since } }],
    },
    orderBy: { queuedAt: "desc" },
    take: ROW_CAP,
    select: {
      id: true,
      documentId: true,
      kbId: true,
      tier: true,
      state: true,
      currentStage: true,
      failureClass: true,
      failureReason: true,
      attempt: true,
      createdInProduct: true,
      queuedAt: true,
      startedAt: true,
      finishedAt: true,
      knowledgeBase: { select: { name: true } },
      document: { select: { title: true } },
      stages: { select: { stage: true, outcome: true, startedAt: true, endedAt: true } },
    },
  });

  return tallyTasks(
    rows.map((r) => ({
      ...r,
      kbName: r.knowledgeBase?.name ?? "—",
      documentTitle: r.document?.title ?? null,
      stages: r.stages,
    })),
    now,
  );
}
