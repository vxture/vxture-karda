"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banner, Button, Card, CardContent, Icon, MetricGrid, Progress, StatusBadge } from "@vxture/design-system";
import { PageHead } from "../../_shell/PageHead";
import type { EvalMetric, EvaluationData } from "../../kb/demo/evaluation-types";
import { useMessages } from "../../_i18n/useMessages";
import { useFormat } from "../../_i18n/useFormat";
import { evaluation as evalMessages } from "../../_i18n/messages/evaluation";
import { shell } from "../../_i18n/messages/shell";

// 验证评测 first cut. Two orthogonal halves, kept visibly apart because they
// answer different questions:
//   · 验证治理 - is the corpus trustworthy? (verified/stale/unverified split,
//     assets below the coverage floor, steward pre-verification waiting)
//   · 质量评测 - does retrieval actually work? (metrics against a baseline,
//     the authored evaluation sets and the coverage gaps they surface)

const DELTA_TONE: Record<EvalMetric["deltaTone"], string> = {
  success: "text-success-text",
  danger: "text-destructive-text",
  neutral: "text-muted-foreground",
};

type EvalPlainKey = {
  [K in keyof typeof evalMessages]: (typeof evalMessages)[K] extends { "zh-CN": string } ? K : never;
}[keyof typeof evalMessages];

/** Metric key -> its name and its one-line explanation. */
const METRIC_KEY: Record<string, { label: EvalPlainKey; hint: EvalPlainKey }> = {
  recall: { label: "metricRecall", hint: "metricRecallHint" },
  precision: { label: "metricCitation", hint: "metricCitationHint" },
  grounded: { label: "metricGrounded", hint: "metricGroundedHint" },
  // The demo overlay adds this one; the live reader does not compute it.
  latency: { label: "metricLatency", hint: "metricLatencyHint" },
};

export function EvaluationClient() {
  const m = useMessages(evalMessages);
  const sh = useMessages(shell);
  const f = useFormat();
  const [data, setData] = useState<EvaluationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evaluation", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as EvaluationData);
      })
      .catch(() => setError(m.errLoad));
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

  const v = data.verification;
  // Composed once and read twice (the page meta and the quality card). The
  // server used to concatenate this - including the "· 链路降级" suffix - which
  // put a sentence on the wire.
  const baselineLine = m.baselineLabel(data.baseline) + (data.degraded ? m.degradedSuffix : "");
  const governed = v.verified + v.stale + v.unverified;
  const pct = (n: number) => (governed === 0 ? 0 : (n / governed) * 100);

  return (
    <>
      <PageHead
        title={sh.navEvaluation}
        description={sh.navEvaluationDesc}
        meta={m.pageMeta(v.coveragePct, v.stale, baselineLine)}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/bench">{sh.subBench}</a>
            </Button>
            {/* The page's primary act is now WORKING the queue, not running an
                evaluation - the runner does not exist yet (batch 14), and this
                does. */}
            <Button asChild>
              <Link href="/evaluation/queue">{m.handleStale}</Link>
            </Button>
          </>
        }
      />

      <MetricGrid
        aria-label={m.statsAria}
        columns={4}
        className="gap-lg"
        items={[
          {
            id: "coverage",
            label: sh.verifyCoverage,
            value: `${v.coveragePct}%`,
            icon: "shield-check",
            tone: "success",
            tags: [m.verifiedTag(v.verified.toLocaleString())],
          },
          {
            id: "stale",
            label: m.metricStale,
            value: v.stale,
            icon: "clock-counter-clockwise",
            tone: "warning",
            tags: [m.metricStaleTag],
          },
          {
            id: "prever",
            label: m.metricPreVerified,
            value: v.preVerifiedPending,
            icon: "sparkles",
            tone: "brand",
            tags: [m.metricPreVerifiedTag],
          },
          {
            id: "gaps",
            label: m.metricGaps,
            value: data.sets.reduce((n, s) => n + s.gaps, 0),
            icon: "target",
            tone: "info",
            tags: [m.metricGapsTag],
          },
        ]}
      />

      <div className="flex flex-col gap-lg @min-[52rem]:flex-row">
        {/* governance half */}
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          <h2 className="text-title-sm">{m.govTitle}</h2>
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="flex h-[10px] w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="h-full bg-success" style={{ width: `${pct(v.verified)}%` }} />
                <span className="h-full bg-warning" style={{ width: `${pct(v.stale)}%` }} />
              </span>
              <div className="flex flex-wrap gap-lg text-body-sm">
                <span className="text-muted-foreground">
                  <span className="mr-2xs inline-block size-2xs rounded-full bg-success align-middle" />
                  {f.verification("verified").label}<span className="ml-2xs font-mono text-foreground">{v.verified.toLocaleString()}</span>
                </span>
                <span className="text-muted-foreground">
                  <span className="mr-2xs inline-block size-2xs rounded-full bg-warning align-middle" />
                  {f.verification("stale").label}<span className="ml-2xs font-mono text-warning-text">{v.stale}</span>
                </span>
                <span className="text-muted-foreground">
                  <span className="mr-2xs inline-block size-2xs rounded-full bg-muted-foreground align-middle" />
                  {f.verification("unverified").label}<span className="ml-2xs font-mono text-foreground">{v.unverified.toLocaleString()}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          <h3 className="text-label-lg text-muted-foreground">
            {m.belowFloorTitle}
            <span className="ml-xs font-mono text-body-sm">&lt; {v.floorPct}%</span>
          </h3>
          {/* Each row now LEADS SOMEWHERE: to exactly that library's outstanding
              work. Until batch 11 this list named the worst-covered assets and
              then left you to find them yourself, which is a report, not a
              workbench. A demo row has no id and stays plainly un-clickable
              rather than linking to a fabricated library. */}
          {v.belowFloor.length === 0 && (
            // An empty heading over nothing reads as a failed load. Saying it
            // plainly is also the reward for working the queue to zero.
            <Card className="py-md">
              <CardContent className="px-lg text-body-sm text-muted-foreground">
                {m.belowFloorEmpty(v.floorPct)}
              </CardContent>
            </Card>
          )}
          <div className="flex flex-col gap-md">
            {v.belowFloor.map((a) => {
              const body = (
                <Card className="h-full py-md transition-colors group-hover:border-primary/25">
                  <CardContent className="flex items-center gap-md px-lg">
                    <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{a.name}</span>
                    <span className="w-[8rem] shrink-0">
                      <Progress value={a.coveragePct} />
                    </span>
                    <span className="w-[3rem] shrink-0 text-right font-mono text-code-sm text-warning-text">
                      {a.coveragePct}%
                    </span>
                    {a.staleCount > 0 && (
                      <StatusBadge tone="warning" dot={false}>
                        {m.staleCount(a.staleCount)}
                      </StatusBadge>
                    )}
                    {a.id && <Icon name="chevron-right" className="shrink-0 text-muted-foreground" />}
                  </CardContent>
                </Card>
              );
              return a.id ? (
                <Link
                  key={a.id}
                  href={`/evaluation/queue?kb=${encodeURIComponent(a.id)}`}
                  aria-label={m.workAsset(a.name)}
                  className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {body}
                </Link>
              ) : (
                <div key={a.name}>{body}</div>
              );
            })}
          </div>
        </div>

        {/* evaluation half */}
        <div className="flex w-full shrink-0 flex-col gap-md xl:w-[26rem]">
          <h2 className="text-title-sm">{m.qualityTitle}</h2>
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="font-mono text-code-sm tracking-widest text-muted-foreground">
                {baselineLine}
              </span>
              <div className="flex flex-col gap-sm border-t border-dashed border-primary/10 pt-sm dark:border-primary/20">
                {data.metrics.map((metric) => (
                  <span key={metric.key} className="flex items-baseline gap-sm">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-sm">{METRIC_KEY[metric.key] ? m[METRIC_KEY[metric.key].label] : metric.key}</span>
                      <span className="text-body-sm text-muted-foreground">{METRIC_KEY[metric.key] ? m[METRIC_KEY[metric.key].hint] : ""}</span>
                    </span>
                    <span className="shrink-0 font-mono text-title-sm">{metric.value}</span>
                    <span className={`w-[3.5rem] shrink-0 text-right font-mono text-code-sm ${DELTA_TONE[metric.deltaTone]}`}>
                      {metric.delta}
                    </span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <h3 className="flex items-baseline gap-sm text-label-lg text-muted-foreground">
            {sh.subSets}
            <Link href="/evaluation/sets" className="text-body-sm text-primary underline-offset-2 hover:underline">
              {m.setsWriteRun}
            </Link>
          </h3>
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              {data.sets.map((s) => {
                const never = s.lastRun === null;
                return (
                  <span key={s.id} className="flex items-center gap-sm text-body-sm">
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 font-mono text-code-sm text-muted-foreground">{m.questionCount(s.questionCount)}</span>
                    {/* WHEN it last ran. The field carried a rendered Chinese
                        phrase until 2026-08-26 and nothing displayed it - the
                        client only string-compared it to detect never-run. Now
                        it is a timestamp, so it can both be tested and shown. */}
                    <span className="w-[5.5rem] shrink-0 truncate text-right text-body-sm text-muted-foreground">
                      {f.relative(s.lastRun) ?? m.neverRun}
                    </span>
                    <span
                      className={`w-[3rem] shrink-0 text-right font-mono text-code-sm ${
                        never ? "text-muted-foreground" : s.passPct >= 85 ? "text-success-text" : "text-warning-text"
                      }`}
                    >
                      {never ? "—" : `${s.passPct}%`}
                    </span>
                    {s.gaps > 0 && (
                      <StatusBadge tone="info" dot={false}>
                        {m.gapCount(s.gaps)}
                      </StatusBadge>
                    )}
                  </span>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Provenance, per group. A single page-wide "demo" line would now be a
          lie: 验证治理 reads live off document/entry verification_state while
          评测 is still the overlay. See EvaluationData.sources. */}
      <span className="text-body-sm text-muted-foreground">
        {data.sources.corpus === "live" ? m.provCorpusLive : m.provCorpusDemo}
        {m.provStewardDemo}
        {data.sources.evaluation === "live" ? m.provEvalLive : m.provEvalDemo}
      </span>
    </>
  );
}
