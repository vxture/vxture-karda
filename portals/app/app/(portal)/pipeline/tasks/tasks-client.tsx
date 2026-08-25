"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, CardContent, Icon } from "@vxture/design-system";
import { PageHead } from "../../../_shell/PageHead";
import { StageDots } from "../_ui";
import type { PipelineTask, TasksData } from "../../../kb/demo/pipeline-types";

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

export function TasksClient() {
  const [data, setData] = useState<TasksData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pipeline/tasks", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as TasksData);
      })
      .catch(() => setError("加载任务队列失败,请稍后重试。"));
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
        正在加载任务队列…
      </div>
    );
  }

  const maxP95 = Math.max(...data.stageP95);
  const stageNames = ["取", "析", "块", "向", "藏"];

  return (
    <>
      <PageHead
        title="任务与队列"
        description="离线加工 · 三级队列 · 文档级原子替换"
        meta={`新鲜度 P95 ${data.throughput.freshnessP95Min} min · 吞吐 ${data.throughput.docsPerMin} docs/min`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/pipeline/rebuild">受控重建</Link>
            </Button>
            <Button asChild>
              <a href="/assets/new">上传文档</a>
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
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">今日吞吐</span>
            <span className="flex items-baseline gap-sm">
              <span className="font-mono text-title-sm">{data.throughput.docsToday}</span>
              <span className="text-body-sm text-muted-foreground">docs · 端到端 P95 {data.throughput.p95Seconds}s</span>
            </span>
          </CardContent>
        </Card>
        <Card className="py-md border-t-medium border-t-primary">
          <CardContent className="flex h-full flex-col gap-2xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">队列深度</span>
            <span className="flex items-baseline gap-md font-mono text-body-sm">
              <span>
                <span className="text-title-sm text-primary">{data.queueDepth.interactive}</span>{" "}
                <span className="text-body-sm text-muted-foreground">交互</span>
              </span>
              <span>
                {data.queueDepth.sync} <span className="text-body-sm text-muted-foreground">同步</span>
              </span>
              <span>
                {data.queueDepth.bulk} <span className="text-body-sm text-muted-foreground">批量</span>
              </span>
            </span>
          </CardContent>
        </Card>
        <Card className="py-md border-t-medium border-t-warning-border">
          <CardContent className="flex h-full flex-col gap-2xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">失败与挂起</span>
            <span className="flex items-baseline gap-md font-mono text-body-sm">
              <span>
                <span className="text-title-sm text-destructive-text">{data.failures.permanent}</span>{" "}
                <span className="text-body-sm text-muted-foreground">失败驻留</span>
              </span>
              <span className="text-warning-text">
                {data.failures.quota} <span className="text-body-sm text-muted-foreground">配额挂起</span>
              </span>
            </span>
          </CardContent>
        </Card>
        <Card className="py-md border-t-medium border-t-success-border">
          <CardContent className="flex h-full flex-col gap-xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">阶段 P95 · 秒</span>
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
              在制 {data.counts.inflight}
            </span>
            <span className="rounded-full border border-border px-3.5 py-1 text-body-sm text-muted-foreground">
              配额挂起 {data.counts.suspended}
            </span>
            <span className="rounded-full border border-border px-3.5 py-1 text-body-sm text-muted-foreground">
              失败驻留 {data.counts.failed}
            </span>
            <span className="ml-auto text-body-sm text-muted-foreground">按进入时间 · 幂等键去重</span>
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
                  {t.statusLabel}
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
                <span className="text-label-lg">三级队列 · 并发</span>
                <span className="font-mono text-code-sm text-muted-foreground">{data.orgConcurrency}</span>
              </div>
              <div className="flex flex-col gap-sm text-body-sm">
                {data.tiers.map((tier) => (
                  <div key={tier.key} className="flex flex-col gap-2xs">
                    <div className="flex justify-between gap-md">
                      <span className="min-w-0 truncate">{tier.label}</span>
                      <span className="shrink-0 font-mono text-code-sm text-muted-foreground">
                        {tier.queued} 排队 · {tier.concurrency}
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
                bulk 永不饿死 interactive;sync 深度超阈值时对 Arda 通道自然背压(notify-then-pull 放缓)。
              </div>
            </CardContent>
          </Card>

          {data.alert && (
            <Card className="py-md border-t-medium border-t-warning-border">
              <CardContent className="flex flex-col gap-xs px-lg">
                <div className="flex items-center gap-sm">
                  <Icon name="warning" size="sm" className="text-warning-text" />
                  <span className="text-label-lg">库级失败率告警</span>
                  <span className="ml-auto font-mono text-code-sm text-warning-text">{data.alert.rate}</span>
                </div>
                <div className="text-body-sm leading-relaxed text-muted-foreground">
                  「{data.alert.kbName}」{data.alert.body}
                  {/* The judgment renders ONLY when the steward actually formed
                      one. A derived alert carries the rate but no opinion, and
                      an empty "管家判断:" label implying one exists would be the
                      most misleading thing on this page. */}
                  {data.alert.judgment ? (
                    <>
                      <span className="text-ai-text">管家判断:</span>
                      <span className="text-foreground">{data.alert.judgment}</span>
                    </>
                  ) : null}
                </div>
                <div className="flex gap-sm pt-2xs">
                  <Button variant="outline" size="sm">
                    查看失败件
                  </Button>
                  <Button size="sm">调整模板</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="font-mono text-code-sm tracking-widest text-muted-foreground">失败分类 · 24H</span>
              <div className="flex flex-col gap-xs text-body-sm">
                <span className="flex items-center gap-sm">
                  <span className="size-2xs rounded-full bg-muted-foreground" />
                  瞬态(退避重试中)
                  <span className="ml-auto font-mono text-code-sm text-muted-foreground">{data.failures.transient}</span>
                </span>
                <span className="flex items-center gap-sm">
                  <span className="size-2xs rounded-full bg-destructive" />
                  永久(驻留待修正)
                  <span className="ml-auto font-mono text-code-sm text-destructive-text">{data.failures.permanent}</span>
                </span>
                <span className="flex items-center gap-sm">
                  <span className="size-2xs rounded-full bg-warning" />
                  配额(恢复自动续)
                  <span className="ml-auto font-mono text-code-sm text-warning-text">{data.failures.quota}</span>
                </span>
              </div>
              <div className="border-t border-dashed border-primary/10 pt-sm text-body-sm text-muted-foreground dark:border-primary/20">
                毒丸隔离:单文档失败不阻塞同库其他文档。
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      {/* Provenance, per group. Counts, queues, stage timings and the task list
          come off karda_kb.processing_task; freshness, the concurrency caps and
          the steward's judgment are authored - see TasksData.sources. */}
      <span className="text-body-sm text-muted-foreground">
        {data.sources.tasks === "live" ? "任务与队列为实时数据" : "任务与队列为演示口径"}
        {" · 新鲜度、并发上限与管家判断为登记/演示口径"}
      </span>
    </>
  );
}
