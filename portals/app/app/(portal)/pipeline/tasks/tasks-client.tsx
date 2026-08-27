"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, CardContent, Icon } from "@vxture/design-system";
import { PageHead } from "../../../_shell/PageHead";
import { StageDots } from "../_ui";
import type { ProcessingStage, PipelineTask, TasksData } from "../../../kb/demo/pipeline-types";
import { useMessages } from "../../../_i18n/useMessages";
import type { Resolved } from "../../../_i18n";
import { pipeline as pipelineMessages } from "../../../_i18n/messages/pipeline";
import { shell } from "../../../_i18n/messages/shell";
import { assets } from "../../../_i18n/messages/assets";

// 任务与队列 (design canvas: PipelineQueue board, light-theme translation).
// Observability strip -> in-flight task list (five-stage dots, links into the
// task detail) -> 页内副栏 (three-tier queues + steward failure-rate alert
// + failure classes). AI empowerment stays visible: the steward on-duty chip,
// the agent-deposit row (runos · karda.kb-write), the steward judgment on the
// alert.

const STATUS_CLASS: Record<PipelineTask["statusTone"], string> = {
  primary: "text-primary",
  ai: "text-ai-text",
  warning: "text-warning-text",
  danger: "text-destructive-text",
  muted: "text-muted-foreground",
};

const ROW_EDGE: Record<PipelineTask["statusTone"], string> = {
  primary: "",
  ai: " border-ai-border/50",
  warning: " border-warning-border/50",
  danger: " border-destructive-border/50",
  muted: "",
};

const PROC_STAGE_KEY = {
  fetch: "procFetch",
  parse: "procParse",
  chunk: "procChunk",
  embed: "procEmbed",
  commit: "procCommit",
} as const satisfies Record<ProcessingStage, keyof typeof pipelineMessages>;

/** The status sentence. `detail` is per-run content and is appended verbatim -
 *  it is the one part of this line the state itself cannot say. */
function statusText(m: Resolved<typeof pipelineMessages>, st: PipelineTask["status"]): string {
  const detail = "detail" in st && st.detail ? ` · ${st.detail}` : "";
  switch (st.kind) {
    case "running":
      return m.statusRunning(m[PROC_STAGE_KEY[st.stage]]) + detail;
    case "queued":
      return m.statusQueued;
    case "retrying":
      return m.statusRetrying(st.attempt) + detail;
    case "suspendedQuota":
      return m.statusSuspendedQuota;
    case "suspendedUnavailable":
      return m.statusSuspendedUnavailable;
    case "suspendedOther":
      return m.statusSuspendedOther;
    case "failed":
      return m.statusFailed(m[PROC_STAGE_KEY[st.stage]]) + detail;
    case "committed":
      return m.statusCommitted + detail;
  }
}

const TIER_KEY = {
  interactive: { name: "tierInteractive", scope: "tierInteractiveScope" },
  sync: { name: "tierSync", scope: "tierSyncScope" },
  bulk: { name: "tierBulk", scope: "tierBulkScope" },
} as const;

/**
 * The failure breakdown, DERIVED FROM THE TYPE rather than hand-written rows.
 *
 * `Record<FailureClassKey, ...>` is the point: add a class to `TasksData` and
 * this stops compiling until it has a label and a tone. The rows used to be
 * three hardcoded spans, and when `unavailable` was split out of `quota`
 * (incr/0008) nothing required a fourth - so the count of tasks parked on a
 * missing capability grant simply VANISHED from the board. That was worse than
 * the mislabel it replaced: before the split those tasks at least showed up,
 * wrongly, under 配额; after it they showed up nowhere, and an operator reading
 * `quota: 0` / `permanent: 0` would conclude nothing was parked at all.
 */
type FailureClassKey = keyof TasksData["failures"];

const FAILURE_LABEL: Record<FailureClassKey, "failTransient" | "failPermanent" | "failQuota" | "failUnavailable"> = {
  transient: "failTransient",
  permanent: "failPermanent",
  quota: "failQuota",
  unavailable: "failUnavailable",
};

const FAILURE_ROWS: { cls: FailureClassKey; dot: string; tone: string }[] = [
  { cls: "transient", dot: "bg-muted-foreground", tone: "text-muted-foreground" },
  { cls: "permanent", dot: "bg-destructive", tone: "text-destructive-text" },
  { cls: "quota", dot: "bg-warning", tone: "text-warning-text" },
  { cls: "unavailable", dot: "bg-warning", tone: "text-warning-text" },
];

export function TasksClient() {
  const m = useMessages(pipelineMessages);
  const sh = useMessages(shell);
  const a = useMessages(assets);
  const [data, setData] = useState<TasksData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pipeline/tasks", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as TasksData);
      })
      .catch(() => setError(m.errLoadTasks));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-[42rem] py-16">
        <Banner tone="danger" title={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-body-md text-muted-foreground">
        <Icon name="spinner" className="mr-2 animate-spin" />
        {m.loadingTasks}
      </div>
    );
  }

  const maxP95 = Math.max(...data.stageP95);
  const stageNames = [m.dotFetch, m.dotParse, m.dotChunk, m.dotEmbed, m.dotCommit];

  return (
    <>
      <PageHead
        title={sh.subTasks}
        description={m.tasksDesc}
        meta={m.tasksMeta(data.throughput.freshnessP95Min, data.throughput.docsPerMin)}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/pipeline/rebuild">{sh.subRebuild}</Link>
            </Button>
            <Button asChild>
              <a href="/assets/new">{a.uploadButton}</a>
            </Button>
          </>
        }
      />

      {/* observability strip */}
      {/* Four across only once the 内容区 is genuinely wide. The 阶段 P95 tile
          carries five labelled mini-columns and needs ~216px of tile content,
          i.e. a ~264px tile, i.e. a ~72rem row - below that the labels wrapped
          and collided with their own bars. Two across until then. */}
      <div className="grid grid-cols-2 gap-lg @min-[72rem]:grid-cols-4">
        <Card className="py-md border-t-medium border-t-primary">
          <CardContent className="flex h-full flex-col gap-2xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.tileThroughput}</span>
            <span className="flex items-baseline gap-sm">
              <span className="font-mono text-title-sm">{data.throughput.docsToday}</span>
              <span className="text-body-sm text-muted-foreground">{m.tileThroughputNote(data.throughput.p95Seconds)}</span>
            </span>
          </CardContent>
        </Card>
        <Card className="py-md border-t-medium border-t-primary">
          <CardContent className="flex h-full flex-col gap-2xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.tileQueueDepth}</span>
            <span className="flex items-baseline gap-md font-mono text-body-sm">
              <span>
                <span className="text-title-sm text-primary">{data.queueDepth.interactive}</span>{" "}
                <span className="text-body-sm text-muted-foreground">{m.tierInteractive}</span>
              </span>
              <span>
                {data.queueDepth.sync} <span className="text-body-sm text-muted-foreground">{m.tierSync}</span>
              </span>
              <span>
                {data.queueDepth.bulk} <span className="text-body-sm text-muted-foreground">{m.tierBulk}</span>
              </span>
            </span>
          </CardContent>
        </Card>
        <Card className="py-md border-t-medium border-t-warning-border">
          <CardContent className="flex h-full flex-col gap-2xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.tileFailures}</span>
            <span className="flex items-baseline gap-md font-mono text-body-sm">
              <span>
                <span className="text-title-sm text-destructive-text">{data.failures.permanent}</span>{" "}
                <span className="text-body-sm text-muted-foreground">{m.failedResident}</span>
              </span>
              <span className="text-warning-text">
                {data.failures.quota} <span className="text-body-sm text-muted-foreground">{m.quotaSuspended}</span>
              </span>
              <span className="text-warning-text">
                {data.failures.unavailable}{" "}
                <span className="text-body-sm text-muted-foreground">{m.capabilitySuspended}</span>
              </span>
            </span>
          </CardContent>
        </Card>
        <Card className="py-md border-t-medium border-t-success-border">
          <CardContent className="flex h-full flex-col gap-xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.tileStageP95}</span>
            {/* Height covers the tallest bar (22px) PLUS its label row: the
                labels moved from 9px to a real DS role, and a bare 26px box
                let the columns overflow up into the title. */}
            <span className="flex h-[48px] items-end gap-2xs">
              {data.stageP95.map((v, i) => (
                <span key={i} className="flex flex-1 flex-col items-center gap-2xs">
                  <span
                    className={`w-full rounded-sm ${v === maxP95 ? "bg-primary" : "bg-muted"}`}
                    style={{ height: `${Math.max(3, Math.round((v / maxP95) * 22))}px` }}
                  />
                  {/* nowrap: "取 1.2" splitting across two lines is what made
                      this tile collide with itself at narrow widths. */}
                  <span className="whitespace-nowrap font-mono text-code-sm text-muted-foreground">
                    {stageNames[i]} {v}
                  </span>
                </span>
              ))}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-lg @min-[52rem]:flex-row">
        {/* task list */}
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          <div className="flex items-center gap-xs">
            <span className="rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-body-sm font-medium text-primary">
              {m.countInflight(data.counts.inflight)}
            </span>
            <span className="rounded-full border border-border px-3.5 py-1 text-body-sm text-muted-foreground">
              {m.countSuspended(data.counts.suspended)}
            </span>
            <span className="rounded-full border border-border px-3.5 py-1 text-body-sm text-muted-foreground">
              {m.countFailed(data.counts.failed)}
            </span>
            <span className="ml-auto text-body-sm text-muted-foreground">{m.orderNote}</span>
          </div>

          <div className="flex flex-col gap-sm">
            {data.tasks.map((t) => (
              <Link
                key={t.id}
                href={`/pipeline/tasks/${t.id}`}
                className={`flex items-center gap-md rounded-md border border-primary/10 px-lg py-sm transition-colors duration-fast ease-standard hover:bg-accent dark:border-primary/20${ROW_EDGE[t.statusTone]}`}
              >
                <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                  <span className="flex min-w-0 items-center gap-sm">
                    {t.agentDeposit && <Icon name="sparkles" size="xs" className="shrink-0 text-ai-text" />}
                    <span className="truncate text-body-sm font-medium">{t.title}</span>
                  </span>
                  <span className="truncate font-mono text-code-sm text-muted-foreground">{t.detail}</span>
                </span>
                <StageDots dots={t.dots} />
                <span className={`w-[7.5rem] shrink-0 text-right text-body-sm ${STATUS_CLASS[t.statusTone]}`}>
                  {statusText(m, t.status)}
                </span>
              </Link>
            ))}
          </div>
        </div>

        {/* 页内副栏 */}
        <div className="flex w-full shrink-0 flex-col gap-md xl:w-[22rem]">
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              <div className="flex items-baseline justify-between">
                <span className="text-label-lg">{m.tiersTitle}</span>
                <span className="font-mono text-code-sm text-muted-foreground">{data.orgConcurrency}</span>
              </div>
              <div className="flex flex-col gap-sm text-body-sm">
                {data.tiers.map((tier) => (
                  <div key={tier.key} className="flex flex-col gap-2xs">
                    <div className="flex justify-between gap-md">
                      <span className="min-w-0 truncate">{`${m[TIER_KEY[tier.key].name]} · ${m[TIER_KEY[tier.key].scope]}`}</span>
                      <span className="shrink-0 font-mono text-code-sm text-muted-foreground">
                        {m.tierQueued(tier.queued, tier.concurrency)}
                      </span>
                    </div>
                    <div className="h-[4px] rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${tier.key === "interactive" ? "bg-primary" : tier.key === "sync" ? "bg-primary/60" : "bg-muted-foreground/50"}`}
                        style={{ width: `${tier.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-dashed border-primary/10 pt-sm text-body-sm leading-relaxed text-muted-foreground dark:border-primary/20">
                {m.backpressureNote}
              </div>
            </CardContent>
          </Card>

          {data.alert && (
            <Card className="py-md border-t-medium border-t-warning-border">
              <CardContent className="flex flex-col gap-xs px-lg">
                <div className="flex items-center gap-sm">
                  <Icon name="warning" size="sm" className="text-warning-text" />
                  <span className="text-label-lg">{m.failureAlertTitle}</span>
                  <span className="ml-auto font-mono text-code-sm text-warning-text">{data.alert.rate}</span>
                </div>
                <div className="text-body-sm leading-relaxed text-muted-foreground">
                  {m.alertBody(data.alert.kbName, data.alert.body)}
                  {/* The judgment renders ONLY when the steward actually formed
                      one. A derived alert carries the rate but no opinion, and
                      an empty "管家判断:" label implying one exists would be the
                      most misleading thing on this page. */}
                  {data.alert.judgment ? (
                    <>
                      <span className="text-ai-text">{m.stewardVerdict}</span>
                      <span className="text-foreground">{data.alert.judgment}</span>
                    </>
                  ) : null}
                </div>
                <div className="flex gap-sm pt-2xs">
                  <Button variant="outline" size="sm">
                    {m.viewFailures}
                  </Button>
                  <Button size="sm">{m.adjustTemplate}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.failureBreakdown}</span>
              <div className="flex flex-col gap-xs text-body-sm">
                {FAILURE_ROWS.map(({ cls, dot, tone }) => (
                  <span key={cls} className="flex items-center gap-sm">
                    <span className={`size-2xs rounded-full ${dot}`} />
                    {m[FAILURE_LABEL[cls]]}
                    <span className={`ml-auto font-mono text-code-sm ${tone}`}>{data.failures[cls]}</span>
                  </span>
                ))}
              </div>
              <div className="border-t border-dashed border-primary/10 pt-sm text-body-sm text-muted-foreground dark:border-primary/20">
                {m.poisonPill}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Provenance, per group. Counts, queues, stage timings and the task list
          come off karda_kb.processing_task; freshness, the concurrency caps and
          the steward's judgment are authored - see TasksData.sources. */}
      <span className="text-body-sm text-muted-foreground">
        {data.sources.tasks === "live" ? m.provTasksLive : m.provTasksDemo}
        {m.provTasksRegistry}
      </span>
    </>
  );
}
