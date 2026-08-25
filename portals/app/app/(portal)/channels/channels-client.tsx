"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, CardContent, Icon, MetricGrid, StatusBadge } from "@vxture/design-system";
import { PageHead } from "../../_shell/PageHead";
import type { ChannelHealth, ChannelsData } from "../../kb/demo/channels-types";
import type { ConsumerReport } from "../../kb/tools/consumer-read";

// 供给通道 first cut: the two channels karda supplies knowledge through -
// direct S2S and the Runos capability plane - as health panels, then the
// registered capability contract, then who is actually consuming. The
// activation checklist is the honest part: the Runos channel is implemented
// but not yet registered, so it reads "待注册 · 503 失败关闭" rather than
// pretending to serve.

const STATE_TONE: Record<ChannelHealth["state"], "success" | "warning" | "neutral"> = {
  live: "success",
  degraded: "warning",
  off: "neutral",
};

function Sparkline({ series, muted }: { series: number[]; muted: boolean }) {
  if (series.length < 2) return null;
  const w = 220;
  const h = 34;
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / 100) * (h - 4)).toFixed(1)}`);
  const color = muted ? "var(--color-muted-foreground)" : "var(--color-primary)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[34px] w-full" aria-hidden="true">
      <polyline points={`0,${h} ${pts.join(" ")} ${w},${h}`} fill={color} fillOpacity="0.10" stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ChannelsClient() {
  const [report, setReport] = useState<ConsumerReport | null>(null);
  const [data, setData] = useState<ChannelsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/channels", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as ChannelsData);
      })
      .catch(() => setError("加载供给通道失败,请稍后重试。"));
    // The drill-down is a SEPARATE, non-fatal fetch: the channel dashboard is
    // still worth showing if the per-consumer query is slow or unavailable, and
    // a failure here must not blank the page.
    fetch("/api/channels/consumers", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) setReport((await res.json()) as ConsumerReport);
      })
      .catch(() => {});
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
        正在加载供给通道…
      </div>
    );
  }

  const { totals } = data;
  const pendingSteps = data.activation.filter((a) => !a.done).length;

  return (
    <>
      <PageHead
        title="供给通道"
        description="直供与 Runos 两条供给通道"
        meta={`今日 ${totals.todayCalls.toLocaleString()} 次 · 直供 ${totals.directCalls} · Runos ${totals.runosCalls} · P95 ${totals.p95Ms}ms`}
        actions={
          <Button variant="outline" asChild>
            <a href="/bench">检验台</a>
          </Button>
        }
      />

      <MetricGrid
        aria-label="供给通道统计"
        columns={4}
        className="gap-lg"
        items={[
          {
            id: "calls",
            label: "今日供给调用",
            value: totals.todayCalls.toLocaleString(),
            icon: "lightning",
            tone: "brand",
            trend: `+${totals.deltaPct}%`,
            trendTone: "success",
          },
          { id: "direct", label: "直供 · S2S", value: totals.directCalls.toLocaleString(), icon: "plug", tone: "info" },
          { id: "runos", label: "Runos · MCP", value: totals.runosCalls.toLocaleString(), icon: "puzzle", tone: "info" },
          { id: "p95", label: "检索 P95", value: `${totals.p95Ms}ms`, icon: "timer", tone: "success" },
        ]}
      />

      {/* channel health */}
      <div className="flex flex-col gap-md">
        <h2 className="text-title-sm">通道健康</h2>
        <div className="grid grid-cols-1 gap-lg @min-[52rem]:grid-cols-2">
          {data.channels.map((c) => {
            const off = c.state === "off";
            return (
              <Card key={c.key} className={`py-md${off ? "" : " border-t-medium border-t-success-border"}`}>
                <CardContent className="flex flex-col gap-sm px-lg">
                  <div className="flex items-start justify-between gap-md">
                    <span className="flex min-w-0 flex-col gap-2xs">
                      <span className="text-label-lg">{c.name}</span>
                      <span className="truncate font-mono text-code-sm text-muted-foreground">{c.endpoint}</span>
                    </span>
                    <StatusBadge tone={STATE_TONE[c.state]} dot>
                      {c.stateLabel}
                    </StatusBadge>
                  </div>
                  <Sparkline series={c.spark} muted={off} />
                  <div className="flex flex-wrap gap-lg text-body-sm">
                    <span className="text-muted-foreground">
                      今日调用<span className="ml-2xs font-mono text-foreground">{c.todayCalls.toLocaleString()}</span>
                    </span>
                    <span className="text-muted-foreground">
                      P95<span className="ml-2xs font-mono text-foreground">{off ? "—" : `${c.p95Ms}ms`}</span>
                    </span>
                    <span className="text-muted-foreground">
                      错误率<span className="ml-2xs font-mono text-foreground">{off ? "—" : `${c.errorRatePct}%`}</span>
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-lg @min-[52rem]:flex-row">
        {/* capabilities */}
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          <h2 className="text-title-sm">能力契约</h2>
          <div className="flex flex-col gap-md">
            {data.capabilities.map((cap) => (
              <Card key={cap.id} className="py-md">
                <CardContent className="flex items-center gap-md px-lg">
                  <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                    <span className="flex items-center gap-sm">
                      <span className="font-mono text-label-lg">{cap.code}</span>
                      <StatusBadge tone={cap.risk === "write" ? "warning" : "info"} dot={false}>
                        {cap.risk === "write" ? "写" : "读"}
                      </StatusBadge>
                    </span>
                    <span className="truncate font-mono text-code-sm text-muted-foreground">
                      {cap.operations.join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2xs">
                    <StatusBadge tone={cap.status === "stable" ? "success" : "warning"} dot>
                      {cap.statusLabel}
                    </StatusBadge>
                    <span className="font-mono text-code-sm text-muted-foreground">
                      今日 {cap.todayCalls.toLocaleString()}
                    </span>
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Batch 13: the drill-down behind the error rate. Rendered ABOVE the
              share bars, because a consumer that is failing is what an operator
              needs first - the share chart says who is busy, this says who is
              broken. */}
          {report && report.diagnosis.length > 0 && (
            <>
              <h2 className="pt-xs text-title-sm">异常消费方</h2>
              <Card className="border-t-medium border-t-destructive-border py-md">
                <CardContent className="flex flex-col gap-sm px-lg">
                  <span className="text-body-sm text-muted-foreground">
                    按<strong>失败量</strong>排序，不是按失败率——4 次调用全挂是 100%，但通常无关紧要；
                    400 次里挂 48 次才是事故。
                  </span>
                  {report.diagnosis.map((d) => (
                    <span key={`${d.code}-${d.channel}`} className="flex flex-wrap items-center gap-sm text-body-sm">
                      <span className="w-[5rem] shrink-0 truncate font-mono text-ai-text">{d.code ?? "（本产品）"}</span>
                      <StatusBadge tone="danger" dot={false}>
                        失败 {d.failed}
                      </StatusBadge>
                      <span className="font-mono text-code-sm text-destructive-text">{d.errorRatePct}%</span>
                      <span className="text-muted-foreground">
                        {d.channel === "runos" ? "能力平台" : "直供通道"}
                        {d.topOperation && ` · ${d.topOperation}`}
                      </span>
                      {d.topErrorCode && (
                        <span className="font-mono text-code-sm text-muted-foreground">{d.topErrorCode}</span>
                      )}
                    </span>
                  ))}
                </CardContent>
              </Card>
            </>
          )}

          <h2 className="pt-xs text-title-sm">消费方 · 今日</h2>
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              {data.consumers.map((c) => (
                <span key={c.code} className="flex items-center gap-md text-body-sm">
                  <span className="w-[4.5rem] shrink-0 truncate font-mono text-ai-text">{c.code}</span>
                  <span className="h-[6px] flex-1 rounded-full bg-muted">
                    <span
                      className={`block h-full rounded-full ${c.via === "runos" ? "bg-ai" : "bg-primary"}`}
                      style={{ width: `${c.sharePct}%` }}
                    />
                  </span>
                  <span className="w-[3.5rem] shrink-0 text-right font-mono text-code-sm text-muted-foreground">
                    {c.calls}
                  </span>
                  <span className="hidden w-[9rem] shrink-0 truncate text-body-sm text-muted-foreground @min-[40rem]:block">
                    {c.topAsset}
                  </span>
                </span>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* activation */}
        <div className="flex w-full shrink-0 flex-col gap-md xl:w-[22rem]">
          <h2 className="text-title-sm">通道启用</h2>
          <Card className={`py-md${pendingSteps > 0 ? " border-t-medium border-t-warning-border" : ""}`}>
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="text-body-sm text-muted-foreground">
                Runos 通道端点已实现,尚未完成注册;未配置凭证时端点 <span className="font-mono">503</span> 失败关闭,
                <span className="text-foreground">不会伪装成可用</span>。
              </span>
              <div className="flex flex-col gap-sm border-t border-dashed border-primary/10 pt-sm dark:border-primary/20">
                {data.activation.map((a) => (
                  <span key={a.label} className="flex items-start gap-sm text-body-sm">
                    <Icon
                      name={a.done ? "success" : "circle-dashed"}
                      size="xs"
                      className={`mt-[3px] shrink-0 ${a.done ? "text-success-text" : "text-muted-foreground"}`}
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className={a.done ? "text-muted-foreground line-through" : "text-foreground"}>{a.label}</span>
                      <span className="text-body-sm text-muted-foreground">{a.note}</span>
                    </span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Provenance, per group. Traffic comes off the supply ledger; the channel
          registry (names, endpoints, serving state, the capability contract and
          the activation checklist) is configuration and liaison state, and stays
          authored on purpose - no amount of traffic tells you whether Runos has
          registered the endpoint. See ChannelsData.sources. */}
      <span className="text-body-sm text-muted-foreground">
        {data.sources.traffic === "live" ? "调用与消费为实时账本" : "调用与消费为演示口径,供给账本随通道里程碑交付"}
        {" · 通道状态与能力契约为登记口径(非账本推导)"}
      </span>
    </>
  );
}
