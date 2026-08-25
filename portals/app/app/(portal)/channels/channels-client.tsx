"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, CardContent, Icon, MetricGrid, StatusBadge } from "@vxture/design-system";
import { PageHead } from "../../_shell/PageHead";
import type { ChannelCapability, ChannelHealth, ChannelsData } from "../../kb/demo/channels-types";
import { useMessages } from "../../_i18n/useMessages";
import { channels as channelMessages } from "../../_i18n/messages/channels";
import { shell } from "../../_i18n/messages/shell";
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

/** Channel state -> its catalog entry. `satisfies` makes a new state fail to
 *  compile until it has a name. */
const STATE_KEY = {
  live: "stateLive",
  degraded: "stateDegraded",
  off: "stateOff",
} as const satisfies Record<ChannelHealth["state"], keyof typeof channelMessages>;

const STATUS_KEY = {
  stable: "statusStable",
  pending: "statusPending",
  unregistered: "statusUnregistered",
} as const satisfies Record<ChannelCapability["status"], keyof typeof channelMessages>;

export function ChannelsClient() {
  const m = useMessages(channelMessages);
  const sh = useMessages(shell);
  const [report, setReport] = useState<ConsumerReport | null>(null);
  const [data, setData] = useState<ChannelsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/channels", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as ChannelsData);
      })
      .catch(() => setError(m.errLoad));
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
        {m.loading}
      </div>
    );
  }

  const { totals } = data;
  const pendingSteps = data.activation.filter((a) => !a.done).length;

  return (
    <>
      <PageHead
        title={sh.navChannels}
        description={sh.navChannelsDesc}
        meta={m.pageMeta(totals.todayCalls.toLocaleString(), totals.directCalls, totals.runosCalls, totals.p95Ms)}
        actions={
          <Button variant="outline" asChild>
            <a href="/bench">{sh.subBench}</a>
          </Button>
        }
      />

      <MetricGrid
        aria-label={m.statsAria}
        columns={4}
        className="gap-lg"
        items={[
          {
            id: "calls",
            label: m.callsToday,
            value: totals.todayCalls.toLocaleString(),
            icon: "lightning",
            tone: "brand",
            trend: `+${totals.deltaPct}%`,
            trendTone: "success",
          },
          { id: "direct", label: m.metricDirect, value: totals.directCalls.toLocaleString(), icon: "plug", tone: "info" },
          { id: "runos", label: "Runos · MCP", value: totals.runosCalls.toLocaleString(), icon: "puzzle", tone: "info" },
          { id: "p95", label: m.metricP95, value: `${totals.p95Ms}ms`, icon: "timer", tone: "success" },
        ]}
      />

      {/* channel health */}
      <div className="flex flex-col gap-md">
        <h2 className="text-title-sm">{m.sectionHealth}</h2>
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
                      {m[STATE_KEY[c.state]]}
                    </StatusBadge>
                  </div>
                  <Sparkline series={c.spark} muted={off} />
                  <div className="flex flex-wrap gap-lg text-body-sm">
                    <span className="text-muted-foreground">
                      {m.callsToday}<span className="ml-2xs font-mono text-foreground">{c.todayCalls.toLocaleString()}</span>
                    </span>
                    <span className="text-muted-foreground">
                      P95<span className="ml-2xs font-mono text-foreground">{off ? "—" : `${c.p95Ms}ms`}</span>
                    </span>
                    <span className="text-muted-foreground">
                      {m.errorRate}<span className="ml-2xs font-mono text-foreground">{off ? "—" : `${c.errorRatePct}%`}</span>
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
          <h2 className="text-title-sm">{m.sectionCapabilities}</h2>
          <div className="flex flex-col gap-md">
            {data.capabilities.map((cap) => (
              <Card key={cap.id} className="py-md">
                <CardContent className="flex items-center gap-md px-lg">
                  <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                    <span className="flex items-center gap-sm">
                      <span className="font-mono text-label-lg">{cap.code}</span>
                      <StatusBadge tone={cap.risk === "write" ? "warning" : "info"} dot={false}>
                        {cap.risk === "write" ? m.riskWrite : m.riskRead}
                      </StatusBadge>
                    </span>
                    <span className="truncate font-mono text-code-sm text-muted-foreground">
                      {cap.operations.join(" · ")}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-2xs">
                    <StatusBadge tone={cap.status === "stable" ? "success" : "warning"} dot>
                      {m[STATUS_KEY[cap.status]]}
                    </StatusBadge>
                    <span className="font-mono text-code-sm text-muted-foreground">
                      {m.capCallsToday(cap.todayCalls.toLocaleString())}
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
              <h2 className="pt-xs text-title-sm">{m.sectionDiagnosis}</h2>
              <Card className="border-t-medium border-t-destructive-border py-md">
                <CardContent className="flex flex-col gap-sm px-lg">
                  <span className="text-body-sm text-muted-foreground">
                    {m.diagnosisNote}
                  </span>
                  {report.diagnosis.map((d) => (
                    <span key={`${d.code}-${d.channel}`} className="flex flex-wrap items-center gap-sm text-body-sm">
                      <span className="w-[5rem] shrink-0 truncate font-mono text-ai-text">{d.code ?? m.ownProduct}</span>
                      <StatusBadge tone="danger" dot={false}>
                        {m.failedCount(d.failed)}
                      </StatusBadge>
                      <span className="font-mono text-code-sm text-destructive-text">{d.errorRatePct}%</span>
                      <span className="text-muted-foreground">
                        {d.channel === "runos" ? m.viaRunos : m.viaDirect}
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

          <h2 className="pt-xs text-title-sm">{m.sectionConsumers}</h2>
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
          <h2 className="text-title-sm">{m.sectionActivation}</h2>
          <Card className={`py-md${pendingSteps > 0 ? " border-t-medium border-t-warning-border" : ""}`}>
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="text-body-sm text-muted-foreground">
                {m.activationLead}
                <span className="font-mono">503</span>
                {m.activationTail}
                <span className="text-foreground">{m.activationStrong}</span>
                {m.activationEnd}
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
        {data.sources.traffic === "live" ? m.provLive : m.provDemo}
        {m.provRegistry}
      </span>
    </>
  );
}
