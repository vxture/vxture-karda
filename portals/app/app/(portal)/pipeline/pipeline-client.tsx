"use client";

import { useEffect, useState } from "react";
import {
  Banner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Icon,
  StatusBadge,
  type IconName,
} from "@vxture/design-system";
import { loginHref } from "../../console/_lib/api";
import { PageHead } from "../../_shell/PageHead";
import type { PipelineData, ProposalKind } from "../../kb/demo/pipeline-types";

// 加工管道 client (design canvas V2 · Steward board, light-theme translation).
// Three 板块 under the unified PageHead, spaced by the layout's global gap-lg:
// steward presence (identity + 今日战报) -> 加工流水 five stage cards -> 待你
// 确认 proposal list. Figures come from GET /api/pipeline (demo overlay until
// the pipeline schema lands - the strip says so).

const PROPOSAL_META: Record<ProposalKind, { icon: IconName; tone: "warning" | "success" | "brand" }> = {
  conflict: { icon: "warning", tone: "warning" },
  preverify: { icon: "check", tone: "success" },
  fix: { icon: "edit", tone: "brand" },
};

const REPORT_TONE: Record<string, string> = {
  warning: "text-warning-text",
  success: "text-success-text",
  ai: "text-ai-text",
};

export function PipelineClient() {
  const [data, setData] = useState<PipelineData | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pipeline", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return setNeedsAuth(true);
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as PipelineData);
      })
      .catch(() => setError("加载加工管道失败,请稍后重试。"));
  }, []);

  if (needsAuth) {
    return (
      <div className="mx-auto flex max-w-[28rem] flex-col items-center gap-4 py-24">
        <EmptyState
          icon="lock"
          title="需要登录"
          description="登录后查看知识管家的加工流水与待确认事项。"
          action={
            <Button asChild>
              <a href={loginHref("/pipeline")}>登录</a>
            </Button>
          }
        />
      </div>
    );
  }

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
        正在加载加工管道…
      </div>
    );
  }

  return (
    <>
      <PageHead
        title="加工管道"
        description="知识管家驱动的智能加工"
        meta={`今日 ${data.docsToday} docs · P95 ${data.p95Seconds}s/doc · 自动处理 ${data.autoRatePct}%`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/console">上传文档</a>
            </Button>
            <Button>批量确认预验</Button>
          </>
        }
      />

      {/* steward presence: identity left, 今日战报 right - the AI layer's
          face. AI tone rides the 2px top edge; foreground stays ai-text. */}
      <Card className="border-t-medium border-t-ai-border py-md">
        <CardContent className="flex flex-wrap items-center gap-lg px-lg">
          <div className="flex min-w-[16rem] items-center gap-md">
            <span className="flex size-media-xs shrink-0 items-center justify-center rounded-lg border border-ai-border/40 bg-ai-muted/40">
              <Icon name="sparkles" size="lg" className="text-ai-text" />
            </span>
            <span className="flex min-w-0 flex-col gap-2xs">
              <span className="flex items-baseline gap-sm">
                <span className="text-label-lg">知识管家</span>
                <span className="font-mono text-[10px] tracking-widest text-ai-text">AI AGENT · 在岗</span>
              </span>
              <span className="text-body-sm text-muted-foreground">
                负责理解、萃取、编织、验证与纠错的全程加工;需要裁决的事项才会来找你。
              </span>
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-lg">
            {data.report.map((r) => (
              <span key={r.label} className="flex flex-col gap-2xs">
                <span className="text-xs text-muted-foreground">{r.label}</span>
                <span className={`font-mono text-body-sm ${r.tone ? REPORT_TONE[r.tone] : "text-foreground"}`}>
                  {r.value}
                </span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* stage flow */}
      <div className="flex flex-col gap-md">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title-sm">加工流水 · 全程 AI 驱动</h2>
          <span className="text-[11px] text-muted-foreground">
            {data.demoOps ? "演示口径 · 管线里程碑建设中" : ""}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-lg xl:grid-cols-5">
          {data.stages.map((s) => (
            <Card key={s.key} className={`py-md${s.active ? " border-t-medium border-t-ai-border" : ""}`}>
              <CardContent className="flex h-full flex-col gap-2xs px-lg">
                <span className={`font-mono text-[10px] tracking-widest ${s.active ? "text-ai-text" : "text-muted-foreground"}`}>
                  {s.kicker}
                </span>
                <span className="text-label-lg">{s.label}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{s.desc}</span>
                <span className="mt-auto flex items-baseline gap-sm pt-2xs">
                  <span className="font-mono text-title-sm">{s.value}</span>
                  <span className="text-xs text-muted-foreground">{s.unit}</span>
                  {s.aside && (
                    <span className={`text-xs ${s.asideTone === "warning" ? "text-warning-text" : "text-muted-foreground"}`}>
                      {s.aside}
                    </span>
                  )}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* proposals */}
      <div className="flex flex-col gap-md">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title-sm">待你确认 · {data.pendingTotal} 项</h2>
          <span className="text-[11px] text-muted-foreground">管家已给出建议与依据,采纳即生效</span>
        </div>
        <div className="flex flex-col gap-md">
          {data.proposals.map((p) => {
            const meta = PROPOSAL_META[p.kind];
            const warn = meta.tone === "warning";
            return (
              <Card key={p.id} className={`py-md${warn ? " border-t-medium border-t-warning-border" : ""}`}>
                <CardContent className="flex items-start gap-md px-lg">
                  <span
                    className={`flex size-media-xs shrink-0 items-center justify-center rounded-lg border ${
                      warn
                        ? "border-warning-border/50 bg-warning-muted/40"
                        : meta.tone === "success"
                          ? "border-success-border/50 bg-success-muted/40"
                          : "border-primary-border/50 bg-primary-muted/40"
                    }`}
                  >
                    <Icon
                      name={meta.icon}
                      size="sm"
                      className={warn ? "text-warning-text" : meta.tone === "success" ? "text-success-text" : "text-primary-text"}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                    <span className="flex items-center gap-sm">
                      <span className="text-label-lg">{p.title}</span>
                      <StatusBadge tone={meta.tone} dot={false}>
                        <span className="font-mono text-[10px] tracking-wide">{p.tag}</span>
                      </StatusBadge>
                    </span>
                    <span className="text-body-sm leading-relaxed text-muted-foreground">
                      {p.body}
                      <span className="text-foreground">{p.strong}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-sm">
                    <Button variant="outline" size="sm">
                      {p.secondaryAction}
                    </Button>
                    <Button size="sm">{p.primaryAction}</Button>
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {data.pendingTotal > data.proposals.length && (
          <div className="flex justify-center">
            <a href="/pipeline" className="text-body-sm text-primary">
              查看其余 {data.pendingTotal - data.proposals.length} 项 →
            </a>
          </div>
        )}
      </div>
    </>
  );
}
