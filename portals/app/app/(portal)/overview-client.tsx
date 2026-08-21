"use client";

import { useEffect, useMemo, useState } from "react";
import { Banner, Button, Card, CardContent, EmptyState, Icon, Progress, StatusBadge } from "@vxture/design-system";
import { loginHref } from "../console/_lib/api";
import type { OverviewAsset, OverviewData } from "../kb/demo/overview-types";

// 资产总览 client. Layout follows the approved V2 design translated to the
// light-first token palette: stats strip -> tag filter bar -> asset cards.
// Every visual signature carries over - verification conic ring, citation
// pulse sparkline, visibility rings - drawn with DS color tokens so both
// themes work without a repaint.

const PUBLISH_LABEL: Record<OverviewAsset["publishState"], string> = {
  private: "私有",
  ws_published: "工作区开放",
  org_published: "组织开放",
};

const HEALTH_META: Record<OverviewAsset["health"], { label: string; tone: "success" | "warning" | "info" | "neutral" }> = {
  healthy: { label: "健康", tone: "success" },
  attention: { label: "需关注", tone: "warning" },
  processing: { label: "加工中", tone: "info" },
  gap: { label: "有缺口", tone: "info" },
};

const SPARK_COLOR: Record<OverviewAsset["sparkTone"], string> = {
  primary: "var(--color-primary)",
  ai: "var(--color-ai)",
  warning: "var(--color-warning)",
};

/** Verification coverage ring (conic gradient over the card surface). */
function CoverageRing({ pct, tone, size = 48 }: { pct: number; tone?: "success" | "warning"; size?: number }) {
  const color = tone === "warning" ? "var(--color-warning)" : "var(--color-success)";
  const hole = size - 13;
  return (
    <div
      aria-label={`验证覆盖 ${pct}%`}
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size, height: size, background: `conic-gradient(${color} 0 ${pct}%, var(--color-muted) ${pct}% 100%)` }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-card font-mono"
        style={{ width: hole, height: hole, fontSize: size >= 52 ? 12 : 10.5, color }}
      >
        {pct}%
      </div>
    </div>
  );
}

/** Citation pulse sparkline (normalized 0-100 series). */
function Sparkline({ series, color, width = 150, height = 24 }: { series: number[]; color: string; width?: number; height?: number }) {
  if (series.length < 2) return null;
  const step = width / (series.length - 1);
  const points = series.map((v, i) => `${(i * step).toFixed(1)},${(height - 2 - (v / 100) * (height - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Visibility glyph: concentric rings, outer rings dashed when not opened. */
function VisibilityGlyph({ state }: { state: OverviewAsset["publishState"] }) {
  const solid = "var(--color-primary)";
  const dash = "var(--color-border)";
  const ws = state !== "private";
  const org = state === "org_published";
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" fill="none" aria-label={PUBLISH_LABEL[state]}>
      <circle cx="20" cy="20" r="6" stroke={solid} strokeWidth="1.8" />
      <circle cx="20" cy="20" r="12" stroke={ws ? solid : dash} strokeWidth="1.2" strokeOpacity={ws ? 0.55 : 1} strokeDasharray={ws ? undefined : "3 4"} />
      <circle cx="20" cy="20" r="18" stroke={org ? solid : dash} strokeWidth="1" strokeOpacity={org ? 0.35 : 1} strokeDasharray={org ? undefined : "3 4"} />
    </svg>
  );
}

function AssetCard({ asset }: { asset: OverviewAsset }) {
  const health = HEALTH_META[asset.health];
  const warn = asset.health === "attention";
  return (
    <Card className={warn ? "border-warning/40" : undefined}>
      <CardContent className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold">{asset.name}</div>
            <div className={`mt-0.5 text-xs ${asset.source === "agent" ? "text-ai-text" : "text-muted-foreground"}`}>
              {asset.sourceLabel} · {asset.entryCount > 0 ? `${asset.entryCount} 条目` : `${asset.docCount} 文档`}
            </div>
          </div>
          <VisibilityGlyph state={asset.publishState} />
        </div>

        {asset.processing ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>管家加工中</span>
              <span className="font-mono">
                {asset.processing.indexed} / {asset.processing.total}
              </span>
            </div>
            <Progress value={(asset.processing.indexed / Math.max(asset.processing.total, 1)) * 100} />
            {asset.processing.parked > 0 && (
              <div className="text-xs text-muted-foreground">{asset.processing.parked} 份停放待向量化</div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <CoverageRing pct={asset.coveragePct} tone={warn ? "warning" : "success"} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between text-xs">
                <span className={asset.topConsumers.length > 1 ? "text-ai-text" : "text-muted-foreground"}>
                  {asset.topConsumers.length > 0 ? `${asset.topConsumers.join(" · ")} 高频引用` : "引用热度 · 7 日"}
                </span>
                <span className="font-mono text-muted-foreground">{asset.heat7d} 次</span>
              </div>
              <Sparkline series={asset.sparkline} color={SPARK_COLOR[asset.sparkTone]} />
            </div>
          </div>
        )}

        <div
          className={`rounded-lg px-3 py-2 text-xs leading-relaxed ${
            warn
              ? "border border-warning/30 bg-warning-muted/40 text-muted-foreground"
              : asset.highlight.kind === "steward"
                ? "border border-ai-border/40 bg-ai-muted/40 text-muted-foreground"
                : "bg-muted/60 text-muted-foreground"
          }`}
        >
          {asset.highlight.text}
          {asset.highlight.strong && <span className="text-foreground">{asset.highlight.strong}</span>}
          {asset.highlight.action && (
            <>
              {" "}
              <span className={warn ? "text-warning-text" : "text-primary"}>{asset.highlight.action}</span>
            </>
          )}
        </div>

        <div className="mt-auto flex items-center gap-1.5 pt-1">
          {asset.tags.map((t) => (
            <span key={t} className="rounded bg-primary/10 px-2 py-0.5 text-[10.5px] text-primary">
              {t}
            </span>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground">{PUBLISH_LABEL[asset.publishState]}</span>
          <StatusBadge tone={health.tone} dot>
            {health.label}
          </StatusBadge>
        </div>
      </CardContent>
    </Card>
  );
}

export function OverviewClient() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/overview", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return setNeedsAuth(true);
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as OverviewData);
      })
      .catch(() => setError("加载资产总览失败,请稍后重试。"));
  }, []);

  const tagCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of data?.assets ?? []) for (const t of a.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()];
  }, [data]);

  const visible = useMemo(
    () => (data?.assets ?? []).filter((a) => !activeTag || a.tags.includes(activeTag)),
    [data, activeTag],
  );

  // DS's bare max-w-* utilities resolve against the density spacing scale
  // (--space-md etc.), not Tailwind's default container scale - arbitrary
  // values below sidestep that collision entirely.
  if (needsAuth) {
    return (
      <div className="mx-auto flex max-w-[28rem] flex-col items-center gap-4 py-24">
        <EmptyState
          icon="lock"
          title="需要登录"
          description="登录后查看工作区的知识资产总览。"
          action={
            <Button asChild>
              <a href={loginHref("/")}>登录</a>
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
        正在加载资产总览…
      </div>
    );
  }

  const { totals } = data;

  return (
    <div className="mx-auto max-w-[1400px] px-8 pb-10">
      {/* page head */}
      <div className="flex items-end justify-between pb-4 pt-6">
        <div>
          <h1 className="text-[22px] font-semibold">资产总览</h1>
          <p className="mt-1 text-[13px] text-muted-foreground">
            {totals.assetCount} 个知识资产 · {totals.entryCount.toLocaleString()} 条知识 · 供给 {totals.topAgents.length + 1} 个
            Agent
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <a href="/console/search">检验台</a>
          </Button>
          <Button asChild>
            <a href="/console">新建资产</a>
          </Button>
        </div>
      </div>

      {/* stats strip */}
      <div className="grid grid-cols-4 gap-3.5">
        <Card>
          <CardContent className="flex items-center gap-4 p-4">
            <CoverageRing pct={totals.coveragePct} size={52} />
            <div>
              <div className="text-xs text-muted-foreground">验证覆盖</div>
              <div className="mt-0.5 text-[13px]">
                {totals.verifiedCount.toLocaleString()} / {totals.entryCount.toLocaleString()} 条
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col justify-center gap-1 p-4">
            <div className="text-xs text-muted-foreground">今日供给调用</div>
            <div className="flex items-baseline gap-3">
              <div className="text-[22px] font-semibold">{totals.todayCalls.toLocaleString()}</div>
              <div className="w-20">
                <Sparkline series={[35, 30, 45, 40, 60, 52, 70, 62, 82]} color="var(--color-primary)" height={22} />
              </div>
              <span className="text-xs text-success-text">+{totals.deltaPct}%</span>
            </div>
            <div className="text-[11px] text-muted-foreground">
              直供 {totals.directCalls} · Runos {totals.runosCalls}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col justify-center gap-1.5 p-4">
            <div className="text-xs text-muted-foreground">调用 TOP 3 · 今日</div>
            {totals.topAgents.map((a, i) => (
              <div key={a.code} className="flex items-center gap-2 text-xs">
                <span className="w-10 truncate">{a.code}</span>
                <div className="h-1 flex-1 rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${i === 0 ? "bg-ai" : "bg-primary"}`}
                    style={{ width: `${Math.round((a.calls / totals.topAgents[0].calls) * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right font-mono text-muted-foreground">{a.calls}</span>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card className="border-ai-border/40 bg-ai-muted/30">
          <CardContent className="flex flex-col justify-center gap-1 p-4">
            <div className="flex items-center gap-1.5 text-xs text-ai-text">
              <Icon name="sparkles" size="sm" />
              知识管家 · 今日
            </div>
            <div className="text-[13px]">
              预验 {totals.steward.preVerified} · 冲突 {totals.steward.conflicts} · 回流萃取 {totals.steward.refluxDrafts}
            </div>
            <a href="/pipeline" className="text-[11.5px] text-ai-text">
              {totals.steward.pending} 项待确认 →
            </a>
          </CardContent>
        </Card>
      </div>

      {/* tag filter bar */}
      <div className="flex items-center gap-2 py-4">
        <button
          onClick={() => setActiveTag(null)}
          className={
            activeTag === null
              ? "rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary"
              : "rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground hover:bg-accent"
          }
        >
          全部 {data.assets.length}
        </button>
        {tagCounts.map(([tag, count]) => (
          <button
            key={tag}
            onClick={() => setActiveTag(activeTag === tag ? null : tag)}
            className={
              activeTag === tag
                ? "rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-xs font-medium text-primary"
                : "rounded-full border border-border px-3.5 py-1 text-xs text-muted-foreground hover:bg-accent"
            }
          >
            {tag} {count}
          </button>
        ))}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {data.demoOps ? "调用与引用为演示口径 · 供给账本建设中" : ""}
        </span>
      </div>

      {/* asset cards */}
      {visible.length === 0 ? (
        <EmptyState icon="folder-open" title="没有匹配的资产" description="换一个标签,或清除筛选。" />
      ) : (
        <div className="grid grid-cols-3 gap-3.5">
          {visible.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      )}
    </div>
  );
}
