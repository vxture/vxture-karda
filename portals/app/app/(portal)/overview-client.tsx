"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Banner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Icon,
  MetricGrid,
  Progress,
  StatusBadge,
  type IconName,
} from "@vxture/design-system";
import { loginHref } from "../console/_lib/api";
import { PageHead } from "../_shell/PageHead";
import type { OverviewAsset, OverviewData } from "../kb/demo/overview-types";

// 知识资产 client. Layout follows the approved V2 design translated to the
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

/** Default card-level icon per source kind (owner 2026-08-24): every asset
 *  card leads with an icon, DS list-card header idiom (icon + title/subtitle).
 *  Names from the DS icon dictionary - agent-built / platform co-built /
 *  business sync / external authority. */
const SOURCE_ICON: Record<OverviewAsset["source"], IconName> = {
  agent: "agent",
  platform: "building-library",
  sync: "database",
  external: "certificate",
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
    // Tone via the DS rule (02-visual-spec §3): semantic colour walks the top
    // edge as a 2px bar, never a full tinted border - the card's own hairline
    // (veil skeleton) stays untouched so a warn card doesn't read "heavier".
    // Density follows MetricCard's precedent for stat-strip-adjacent cards:
    // py-lg/px-lg instead of the Card default py-xl/px-xl.
    <Card className={`py-lg${warn ? " border-t-medium border-t-warning-border" : ""}`}>
      <CardContent className="flex h-full flex-col gap-md px-lg">
        {/* Header per the DS list-card idiom (MetricListCard): leading icon +
            title/subtitle column, publish-scope glyph kept at the row's end. */}
        <div className="flex min-w-0 items-start gap-sm">
          <Icon name={SOURCE_ICON[asset.source]} size="lg" fallback="placeholder" className="shrink-0 text-muted-foreground" />
          <div className="flex min-w-0 flex-1 flex-col gap-2xs">
            <span className="truncate text-label-lg text-foreground">{asset.name}</span>
            <span className={`truncate text-body-sm ${asset.source === "agent" ? "text-ai-text" : "text-muted-foreground"}`}>
              {asset.sourceLabel} · {asset.entryCount > 0 ? `${asset.entryCount} 条目` : `${asset.docCount} 文档`}
            </span>
          </div>
          <VisibilityGlyph state={asset.publishState} />
        </div>

        {asset.processing ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-body-sm text-muted-foreground">
              <span>管家加工中</span>
              <span className="font-mono">
                {asset.processing.indexed} / {asset.processing.total}
              </span>
            </div>
            <Progress value={(asset.processing.indexed / Math.max(asset.processing.total, 1)) * 100} />
            {asset.processing.parked > 0 && (
              <div className="text-body-sm text-muted-foreground">{asset.processing.parked} 份停放待向量化</div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <CoverageRing pct={asset.coveragePct} tone={warn ? "warning" : "success"} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex items-center justify-between text-body-sm">
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
          className={`rounded-lg px-3 py-2 text-body-sm leading-relaxed ${
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

        {/* Action row opens with the DS field hairline (CardFooter recipe):
            dashed = row/field separation, brand @10% (light) / @20% (dark). */}
        <div className="mt-auto flex items-center gap-1.5 border-t border-dashed border-primary/10 pt-md dark:border-primary/20">
          {asset.tags.map((t) => (
            <span key={t} className="rounded bg-primary/10 px-2 py-0.5 text-body-sm text-primary">
              {t}
            </span>
          ))}
          <span className="ml-auto shrink-0 text-body-sm text-muted-foreground">{PUBLISH_LABEL[asset.publishState]}</span>
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
      .catch(() => setError("加载知识资产失败,请稍后重试。"));
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
          description="登录后查看工作区的知识资产。"
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
      <div className="flex items-center justify-center py-24 text-body-md text-muted-foreground">
        <Icon name="spinner" className="mr-2 animate-spin" />
        正在加载知识资产…
      </div>
    );
  }

  const { totals } = data;

  return (
    // Sections render as a fragment: the portal layout owns the edge padding
    // and the flex-col gap-lg rhythm, so each block below is a direct child of
    // that global column - no page-local container, no per-section margins.
    <>
      <PageHead
        title="知识资产"
        description="知识资产的统计、运营与健康"
        meta={`${totals.assetCount} 资产 · ${totals.entryCount.toLocaleString()} 条知识 · 验证覆盖 ${totals.coveragePct}%`}
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/console/search">检验台</a>
            </Button>
            <Button asChild>
              <a href="/console">新建资产</a>
            </Button>
          </>
        }
      />

      {/* stats strip: the DS standard metric row (MetricGrid -> MetricCard,
          watermark backdrop + tone top-edge + label/value rows), replacing the
          hand-rolled Cards. MetricGrid owns the elastic ladder (1 -> 2 -> 4). */}
      <MetricGrid
        aria-label="知识资产统计"
        columns={4}
        // Match the asset grid's gap-lg below (MetricGrid defaults gap-md);
        // the two 板块 must share one rhythm.
        className="gap-lg"
        items={[
          {
            id: "coverage",
            label: "验证覆盖",
            value: `${totals.coveragePct}%`,
            icon: "shield-check",
            tone: "success",
            tags: [`${totals.verifiedCount.toLocaleString()} / ${totals.entryCount.toLocaleString()} 条`],
          },
          {
            id: "calls",
            label: "今日供给调用",
            value: totals.todayCalls.toLocaleString(),
            icon: "lightning",
            tone: "brand",
            trend: `+${totals.deltaPct}%`,
            trendTone: "success",
            tags: [`直供 ${totals.directCalls}`, `Runos ${totals.runosCalls}`],
          },
          {
            id: "top-agents",
            label: "调用 TOP 3 · 今日",
            value: totals.topAgents[0] ? `${totals.topAgents[0].code} ${totals.topAgents[0].calls}` : "—",
            icon: "agent",
            tone: "info",
            tags: totals.topAgents.slice(1).map((a) => `${a.code} ${a.calls}`),
          },
          {
            id: "steward",
            label: "知识管家 · 今日",
            value: totals.steward.pending,
            icon: "sparkles",
            tone: "brand",
            description: (
              <a href="/pipeline" className="text-primary">
                项待确认 →
              </a>
            ),
            tags: [
              `预验 ${totals.steward.preVerified}`,
              `冲突 ${totals.steward.conflicts}`,
              `回流萃取 ${totals.steward.refluxDrafts}`,
            ],
          },
        ]}
      />

      {/* Tag filter bar - no own vertical padding: the section rhythm spaces
          it, gap-xs separates the chips. It WRAPS and every chip is
          shrink-0/nowrap: as a single non-wrapping row the chips compressed
          instead of overflowing, and each label collapsed to one character per
          line once the 内容区 narrowed (owner 2026-08-25). */}
      <div className="flex flex-wrap items-center gap-xs">
        <button
          onClick={() => setActiveTag(null)}
          className={
            activeTag === null
              ? "shrink-0 whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-label-sm text-primary"
              : "shrink-0 whitespace-nowrap rounded-full border border-border px-3.5 py-1 text-body-sm text-muted-foreground hover:bg-accent"
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
                ? "shrink-0 whitespace-nowrap rounded-full border border-primary/40 bg-primary/10 px-3.5 py-1 text-label-sm text-primary"
                : "shrink-0 whitespace-nowrap rounded-full border border-border px-3.5 py-1 text-body-sm text-muted-foreground hover:bg-accent"
            }
          >
            {tag} {count}
          </button>
        ))}
        <span className="ml-auto text-body-sm text-muted-foreground">
          {data.demoOps ? "调用与引用为演示口径 · 供给账本建设中" : ""}
        </span>
      </div>

      {/* asset cards */}
      {visible.length === 0 ? (
        <EmptyState icon="folder-open" title="没有匹配的资产" description="换一个标签,或清除筛选。" />
      ) : (
        // Elastic asset grid, driven by the 内容区's OWN width, not the
        // viewport (owner 2026-08-25). PortalShell marks the 内容区 as an
        // @container; a viewport breakpoint cannot see whether 导航栏 and
        // 值班台 are open, which is how a 1600px window used to draw four
        // columns into an 840px pane.
        //
        // The 内容区 measures (viewport - 48 window margin - 280 导航栏 -
        // 320 值班台 - 48 pane spacers - 64 content inset):
        //   both panes open   1440 -> 42rem   1600 -> 52rem   1920 -> 72rem
        //   both collapsed    1440 -> 83rem   1600 -> 93rem
        // so 76rem is the four-column gate: three columns is the default
        // whenever both side panes are open, four only once they are not.
        <div className="grid grid-cols-1 gap-lg @min-[26rem]:grid-cols-2 @min-[40rem]:grid-cols-3 @min-[76rem]:grid-cols-4">
          {visible.map((a) => (
            <AssetCard key={a.id} asset={a} />
          ))}
        </div>
      )}
    </>
  );
}
