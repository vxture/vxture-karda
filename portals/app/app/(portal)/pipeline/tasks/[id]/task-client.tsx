"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Button, Icon } from "@vxture/design-system";
import { KVRows, AsideCard } from "../../_ui";
import type { TaskDetail, TaskStage } from "../../../../kb/demo/pipeline-types";
import { useMessages } from "../../../../_i18n/useMessages";
import { pipeline as pipelineMessages } from "../../../../_i18n/messages/pipeline";
import { shell } from "../../../../_i18n/messages/shell";

// 任务详情 (design canvas: PipelineDoc board). Five-stage timeline with
// per-stage artifacts on the left (阶段产物留存: raw/IR/块/向量), the steward
// presence strip under it, and the three 页内副栏 cards (加工配置 / 血缘与幂等 /
// 成本) on the right.

const CHIP_CLASS: Record<NonNullable<TaskStage["chips"]>[number]["tone"], string> = {
  muted: "border-primary/10 bg-muted/60 text-muted-foreground dark:border-primary/20",
  primary: "border-primary-border/40 bg-primary-muted/40 text-primary-text",
  ai: "border-ai-border/40 bg-ai-muted/40 text-ai-text",
  dim: "border-primary/10 text-muted-foreground dark:border-primary/20",
};

function StageNode({ stage, last }: { stage: TaskStage; last: boolean }) {
  return (
    <div className="flex gap-md">
      <div className="flex w-[24px] shrink-0 flex-col items-center">
        {stage.state === "done" ? (
          <span className="flex size-icon-lg items-center justify-center rounded-full border border-success-border bg-success-muted/40">
            <Icon name="check" size="xs" className="text-success-text" />
          </span>
        ) : stage.state === "active" ? (
          <span className="flex size-icon-lg items-center justify-center rounded-full border border-primary bg-primary-muted/40">
            <span className="size-2xs rounded-full bg-primary" />
          </span>
        ) : (
          <span className="flex size-icon-lg items-center justify-center rounded-full border border-border">
            <span className="font-mono text-code-sm text-muted-foreground">{stage.kicker.slice(0, 2)}</span>
          </span>
        )}
        {!last && (
          <span
            className={`w-px flex-1 ${stage.state === "done" ? "bg-success-border/60" : "bg-border"}`}
            aria-hidden="true"
          />
        )}
      </div>
      <div className={`flex min-w-0 flex-1 flex-col gap-2xs ${last ? "" : "pb-md"}`}>
        <div className="flex items-baseline gap-sm">
          <span
            className={`font-mono text-code-sm tracking-widest ${stage.state === "active" ? "text-primary" : "text-muted-foreground"}`}
          >
            {stage.kicker}
          </span>
          <span className={`text-body-sm font-semibold ${stage.state === "todo" ? "text-muted-foreground" : ""}`}>
            {stage.label}
          </span>
          {stage.progressPct !== undefined && <span className="text-body-sm text-primary">{stage.progressPct}%</span>}
          {stage.timing && <span className="ml-auto font-mono text-code-sm text-muted-foreground">{stage.timing}</span>}
        </div>
        {stage.progressPct !== undefined && (
          <div className="h-[4px] max-w-[32rem] rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${stage.progressPct}%` }} />
          </div>
        )}
        <span className={`text-body-sm leading-relaxed ${stage.state === "todo" ? "text-muted-foreground" : "text-muted-foreground"}`}>
          {stage.desc}
        </span>
        {stage.chips && (
          <span className="flex flex-wrap gap-sm pt-2xs">
            {stage.chips.map((c) => (
              <span key={c.label} className={`rounded-md border px-sm py-2xs font-mono text-code-sm ${CHIP_CLASS[c.tone]}`}>
                {c.label}
              </span>
            ))}
          </span>
        )}
      </div>
    </div>
  );
}

export function TaskClient({ id }: { id: string }) {
  const m = useMessages(pipelineMessages);
  const sh = useMessages(shell);
  const [data, setData] = useState<TaskDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/pipeline/tasks/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as TaskDetail);
      })
      .catch(() => setError(m.errLoadTask));
  }, [id]);

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
        {m.loadingTask}
      </div>
    );
  }

  return (
    <>
      {/* breadcrumb + task head (the PageHead pattern, task-flavoured) */}
      <div className="flex flex-col gap-xs">
        <div className="text-body-sm text-muted-foreground">
          <Link href="/pipeline" className="hover:text-foreground">{sh.navPipeline}</Link>
          {" / "}
          <Link href="/pipeline/tasks" className="hover:text-foreground">{sh.subTasks}</Link>
          {" / "}
          <span className="font-mono">{data.id}</span>
        </div>
        <div className="flex items-start justify-between gap-lg">
          <div className="flex min-w-0 flex-col gap-2xs">
            <h1 className="truncate text-title-lg">{data.title}</h1>
            <div className="flex items-center gap-md font-mono text-code-sm text-muted-foreground">
              {data.meta.map((m) => (
                <span key={m}>{m}</span>
              ))}
              <span className="rounded-md bg-primary/10 px-sm py-2xs text-primary">{data.badge}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-sm">
            <Button variant="outline" size="sm">{m.cancelTask}</Button>
            <Button variant="outline" size="sm">{m.rerunFromChunk}</Button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-lg @min-[52rem]:flex-row">
        {/* stage timeline + steward strip */}
        <div className="flex min-w-0 flex-1 flex-col">
          {data.stages.map((s, i) => (
            <StageNode key={s.kicker} stage={s} last={i === data.stages.length - 1} />
          ))}

          <div className="mt-lg flex items-start gap-md rounded-lg border border-ai-border/40 bg-ai-muted/30 p-md">
            <span className="flex size-media-xs shrink-0 items-center justify-center rounded-lg border border-ai-border/40 bg-ai-muted/40">
              <Icon name="sparkles" size="sm" className="text-ai-text" />
            </span>
            <span className="flex min-w-0 flex-col gap-2xs">
              <span className="flex items-center gap-sm">
                <span className="text-body-sm font-semibold">{m.stewardPresent}</span>
                <span className="font-mono text-code-sm tracking-widest text-ai-text">AI AGENT</span>
              </span>
              <span className="text-body-sm leading-relaxed text-muted-foreground">
                {m.taskStewardLead}
                <span className="text-foreground">{m.taskStewardStrong}</span>
                {m.taskStewardEnd}
              </span>
            </span>
          </div>
        </div>

        {/* 页内副栏 */}
        <div className="flex w-full shrink-0 flex-col gap-md xl:w-[23rem]">
          <AsideCard title={m.asideConfig}>
            <KVRows rows={data.config} />
            <div className="border-t border-dashed border-primary/10 pt-sm text-body-sm text-muted-foreground dark:border-primary/20">
              {data.configNote}
            </div>
          </AsideCard>
          <AsideCard title={m.asideLineage}>
            <KVRows rows={data.lineage} />
            <div className="border-t border-dashed border-primary/10 pt-sm text-body-sm text-muted-foreground dark:border-primary/20">
              {data.lineageNote}
            </div>
          </AsideCard>
          <AsideCard title={m.asideCost} aside={m.asideCostNote}>
            <KVRows rows={data.cost} />
          </AsideCard>
        </div>
      </div>
    </>
  );
}
