"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, CardContent, Icon, StatusBadge } from "@vxture/design-system";
import { PageHead } from "../../../_shell/PageHead";
import { KVRows, AsideCard } from "../_ui";
import type { RebuildData } from "../../../kb/demo/pipeline-types";
import { useMessages } from "../../../_i18n/useMessages";
import { pipeline as pipelineMessages } from "../../../_i18n/messages/pipeline";
import { shell } from "../../../_i18n/messages/shell";
import { common } from "../../../_i18n/messages/common";

// 受控重建 (design canvas: PipelineRebuild board, light-theme translation).
// build-then-swap: active rebuild (4-step progress, old index keeps serving),
// a switched library inside its rollback window, a queued package
// instantiation; 页内副栏 = triggers, safety constraints, the steward's advice.

const STEP_KEYS = ["stepDeclare", "stepShadow", "stepSwap", "stepWindow"] as const;

export function RebuildClient() {
  const m = useMessages(pipelineMessages);
  const sh = useMessages(shell);
  const c = useMessages(common);
  const [data, setData] = useState<RebuildData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pipeline/rebuild", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as RebuildData);
      })
      .catch(() => setError(m.errLoadRebuild));
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
        {m.loadingRebuild}
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={sh.subRebuild}
        description={m.rebuildDesc}
        meta={m.rebuildMeta}
        actions={<Button>{m.rebuildStart}</Button>}
      />

      <div className="flex flex-col gap-lg @min-[52rem]:flex-row">
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          {/* active rebuild */}
          <Card className="py-md border-t-medium border-t-primary">
            <CardContent className="flex flex-col gap-md px-lg">
              <div className="flex items-start justify-between gap-md">
                <span className="flex min-w-0 flex-col gap-2xs">
                  <span className="flex items-center gap-sm">
                    <span className="text-label-lg">{data.active.kbName}</span>
                    <StatusBadge tone="brand" dot>
                      <span className="font-mono text-code-sm">REBUILDING</span>
                    </StatusBadge>
                  </span>
                  <span className="text-body-sm text-muted-foreground">{m.triggerLabel(data.active.trigger)}</span>
                </span>
                <StatusBadge tone="success" dot>
                  {data.active.servingNote}
                </StatusBadge>
              </div>

              {/* 4 steps */}
              <div className="flex items-center">
                {STEP_KEYS.map((s, i) => (
                  <div key={s} className={`flex items-center ${i > 0 ? "flex-1" : ""}`}>
                    {i > 0 && (
                      <span
                        className={`mx-sm h-px flex-1 ${i <= data.active.stepIndex ? "bg-success-border/60" : "bg-border"}`}
                        aria-hidden="true"
                      />
                    )}
                    <span className="flex shrink-0 items-center gap-sm">
                      {i < data.active.stepIndex ? (
                        <span className="flex size-icon-md items-center justify-center rounded-full border border-success-border bg-success-muted/40">
                          <Icon name="check" size="xs" className="text-success-text" />
                        </span>
                      ) : i === data.active.stepIndex ? (
                        <span className="flex size-icon-md items-center justify-center rounded-full border border-primary bg-primary-muted/40">
                          <span className="size-2xs rounded-full bg-primary" />
                        </span>
                      ) : (
                        <span className="size-icon-md rounded-full border border-border" />
                      )}
                      <span
                        className={`text-body-sm ${i === data.active.stepIndex ? "font-semibold" : "text-muted-foreground"}`}
                      >
                        {m[s]}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-lg">
                <div className="flex min-w-0 flex-1 flex-col gap-2xs">
                  <div className="flex justify-between text-body-sm">
                    <span className="text-muted-foreground">{m.shadowProgress}</span>
                    <span className="font-mono text-primary">{data.active.progressLabel}</span>
                  </div>
                  <div className="h-[5px] rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${data.active.progressPct}%` }} />
                  </div>
                  <div className="flex gap-md font-mono text-code-sm text-muted-foreground">
                    {data.active.facts.map((f) => (
                      <span key={f}>{f}</span>
                    ))}
                  </div>
                </div>
                <div className="flex shrink-0 gap-sm">
                  <Button variant="outline" size="sm">{c.pause}</Button>
                  <Button variant="outline" size="sm" className="border-destructive-border/50 text-destructive-text">
                    {m.discardShadow}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* switched, rollback window open */}
          <Card className="py-md border-t-medium border-t-success-border">
            <CardContent className="flex items-center gap-lg px-lg">
              <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                <span className="flex items-center gap-sm">
                  <span className="text-label-lg">{data.switched.kbName}</span>
                  <StatusBadge tone="success" dot={false}>
                    <span className="font-mono text-code-sm">SWITCHED</span>
                  </StatusBadge>
                </span>
                <span className="text-body-sm text-muted-foreground">{data.switched.changeNote}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2xs">
                <span className="font-mono text-code-sm text-muted-foreground">
                  {m.rollbackLeft(data.switched.windowLeft)}
                </span>
                <span className="h-[4px] w-[8rem] rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full bg-success"
                    style={{ width: `${data.switched.windowPct}%` }}
                  />
                </span>
              </span>
              <Button variant="outline" size="sm" className="shrink-0">
                {data.switched.rollbackTo}
              </Button>
            </CardContent>
          </Card>

          {/* instantiation queued */}
          <Card className="py-md">
            <CardContent className="flex items-center gap-lg px-lg">
              <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                <span className="flex items-center gap-sm">
                  <span className="text-label-lg">{data.instantiation.title}</span>
                  <StatusBadge tone="neutral" dot={false}>
                    <span className="font-mono text-code-sm">QUEUED · BULK</span>
                  </StatusBadge>
                </span>
                <span className="text-body-sm text-muted-foreground">{data.instantiation.flowNote}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-2xs font-mono text-code-sm text-muted-foreground">
                <span>{data.instantiation.estimate}</span>
                <span>{data.instantiation.costNote}</span>
              </span>
              <Button variant="outline" size="sm" className="shrink-0">
                {m.queueDetail}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 页内副栏 */}
        <div className="flex w-full shrink-0 flex-col gap-md xl:w-[22rem]">
          <AsideCard title={m.whatTriggers}>
            <div className="flex flex-col gap-xs text-body-sm text-muted-foreground">
              {data.triggers.map((t) => (
                <span key={t} className="flex gap-sm">
                  <span className="mt-[6px] size-2xs shrink-0 rounded-full bg-primary" />
                  <span>{t}</span>
                </span>
              ))}
            </div>
          </AsideCard>
          <AsideCard title={m.safetyLimits}>
            <KVRows rows={data.constraints} />
          </AsideCard>
          <Card className="py-md border-t-medium border-t-ai-border">
            <CardContent className="flex flex-col gap-xs px-lg">
              <span className="flex items-center gap-sm">
                <Icon name="sparkles" size="sm" className="text-ai-text" />
                <span className="text-label-lg">{m.stewardSuggestion}</span>
              </span>
              <span className="text-body-sm leading-relaxed text-muted-foreground">{data.stewardAdvice}</span>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
