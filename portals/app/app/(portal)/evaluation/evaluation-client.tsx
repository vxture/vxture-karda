"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Card, CardContent, Icon, MetricGrid, Progress, StatusBadge } from "@vxture/design-system";
import { PageHead } from "../../_shell/PageHead";
import type { EvalMetric, EvaluationData } from "../../kb/demo/evaluation-types";

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

export function EvaluationClient() {
  const [data, setData] = useState<EvaluationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/evaluation", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as EvaluationData);
      })
      .catch(() => setError("加载验证评测失败,请稍后重试。"));
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
      <div className="flex items-center justify-center py-24 text-sm text-muted-foreground">
        <Icon name="spinner" className="mr-2 animate-spin" />
        正在加载验证评测…
      </div>
    );
  }

  const v = data.verification;
  const governed = v.verified + v.stale + v.unverified;
  const pct = (n: number) => (governed === 0 ? 0 : (n / governed) * 100);

  return (
    <>
      <PageHead
        title="验证评测"
        description="验证、评测与质量基线"
        meta={`覆盖 ${v.coveragePct}% · 待复验 ${v.stale} · ${data.baselineLabel}`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/console/search">检验台</a>
            </Button>
            <Button>运行评测</Button>
          </>
        }
      />

      <MetricGrid
        aria-label="验证评测统计"
        columns={4}
        className="gap-lg"
        items={[
          {
            id: "coverage",
            label: "验证覆盖",
            value: `${v.coveragePct}%`,
            icon: "shield-check",
            tone: "success",
            tags: [`已验证 ${v.verified.toLocaleString()}`],
          },
          {
            id: "stale",
            label: "待复验",
            value: v.stale,
            icon: "clock-counter-clockwise",
            tone: "warning",
            tags: ["过期需重新确认"],
          },
          {
            id: "prever",
            label: "管家预验待确认",
            value: v.preVerifiedPending,
            icon: "sparkles",
            tone: "brand",
            tags: ["低风险 · 可批量"],
          },
          {
            id: "gaps",
            label: "覆盖缺口",
            value: data.sets.reduce((n, s) => n + s.gaps, 0),
            icon: "target",
            tone: "info",
            tags: ["评测中查不到的问题"],
          },
        ]}
      />

      <div className="flex flex-col gap-lg xl:flex-row">
        {/* governance half */}
        <div className="flex min-w-0 flex-1 flex-col gap-md">
          <h2 className="text-title-sm">验证治理</h2>
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="flex h-[10px] w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
                <span className="h-full bg-success" style={{ width: `${pct(v.verified)}%` }} />
                <span className="h-full bg-warning" style={{ width: `${pct(v.stale)}%` }} />
              </span>
              <div className="flex flex-wrap gap-lg text-body-sm">
                <span className="text-muted-foreground">
                  <span className="mr-2xs inline-block size-2xs rounded-full bg-success align-middle" />
                  已验证<span className="ml-2xs font-mono text-foreground">{v.verified.toLocaleString()}</span>
                </span>
                <span className="text-muted-foreground">
                  <span className="mr-2xs inline-block size-2xs rounded-full bg-warning align-middle" />
                  待复验<span className="ml-2xs font-mono text-warning-text">{v.stale}</span>
                </span>
                <span className="text-muted-foreground">
                  <span className="mr-2xs inline-block size-2xs rounded-full bg-muted-foreground align-middle" />
                  未验证<span className="ml-2xs font-mono text-foreground">{v.unverified.toLocaleString()}</span>
                </span>
              </div>
            </CardContent>
          </Card>

          <h3 className="text-label-lg text-muted-foreground">低于覆盖基线的资产</h3>
          <div className="flex flex-col gap-md">
            {v.belowFloor.map((a) => (
              <Card key={a.name} className="py-md">
                <CardContent className="flex items-center gap-md px-lg">
                  <span className="min-w-0 flex-1 truncate text-body-sm font-medium">{a.name}</span>
                  <span className="w-[8rem] shrink-0">
                    <Progress value={a.coveragePct} />
                  </span>
                  <span className="w-[3rem] shrink-0 text-right font-mono text-xs text-warning-text">
                    {a.coveragePct}%
                  </span>
                  {a.staleCount > 0 && (
                    <StatusBadge tone="warning" dot={false}>
                      待复验 {a.staleCount}
                    </StatusBadge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* evaluation half */}
        <div className="flex w-full shrink-0 flex-col gap-md xl:w-[26rem]">
          <h2 className="text-title-sm">质量评测</h2>
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              <span className="font-mono text-[10px] tracking-widest text-muted-foreground">
                {data.baselineLabel}
              </span>
              <div className="flex flex-col gap-sm border-t border-dashed border-primary/10 pt-sm dark:border-primary/20">
                {data.metrics.map((m) => (
                  <span key={m.key} className="flex items-baseline gap-sm">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-body-sm">{m.label}</span>
                      <span className="text-xs text-muted-foreground">{m.hint}</span>
                    </span>
                    <span className="shrink-0 font-mono text-title-sm">{m.value}</span>
                    <span className={`w-[3.5rem] shrink-0 text-right font-mono text-xs ${DELTA_TONE[m.deltaTone]}`}>
                      {m.delta}
                    </span>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>

          <h3 className="text-label-lg text-muted-foreground">评测集</h3>
          <Card className="py-md">
            <CardContent className="flex flex-col gap-sm px-lg">
              {data.sets.map((s) => {
                const never = s.lastRun === "未运行";
                return (
                  <span key={s.id} className="flex items-center gap-sm text-body-sm">
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    <span className="shrink-0 font-mono text-xs text-muted-foreground">{s.questionCount} 题</span>
                    <span
                      className={`w-[3rem] shrink-0 text-right font-mono text-xs ${
                        never ? "text-muted-foreground" : s.passPct >= 85 ? "text-success-text" : "text-warning-text"
                      }`}
                    >
                      {never ? "—" : `${s.passPct}%`}
                    </span>
                    {s.gaps > 0 && (
                      <StatusBadge tone="info" dot={false}>
                        缺口 {s.gaps}
                      </StatusBadge>
                    )}
                  </span>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </div>

      {data.demoOps && (
        <span className="text-[11px] text-muted-foreground">评测口径为演示数据 · 评测运行器建设中</span>
      )}
    </>
  );
}
