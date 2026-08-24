"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@vxture/design-system";
import { NAV_ITEMS, type NavItem } from "./nav";
import type { ShellData } from "../kb/demo/shell-types";

// LEFT rail of the V3 指挥台 shell: one panel card per functional domain,
// sitting on the shared ground (the rail itself paints nothing).
//
// Each card VISUALIZES its domain rather than listing numbers - a coverage
// ring, a call-volume sparkline, a work-mix bar - over a light title. Three
// rules from the owner (2026-08-24) shape the treatment:
//   · surfaces are translucent (bg-card/60), never a solid slab;
//   · the title is light - it names the card, it is not the loudest thing on it;
//   · ACTIVE is a property of the CARD (brand border + brand-tinted veil),
//     not a highlight bar behind the title.
// Cards are few, so every body is expanded by default; the caret is there for
// the rare moment a body is more than wanted.
//
// Collapsed = the rail unmounts entirely (no icon rail).

const OPEN_KEY = "karda-shell-cards-closed";

/** Verification-coverage ring: conic fill over the card surface. */
function CoverageRing({ pct }: { pct: number }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-media-xs shrink-0 items-center justify-center rounded-full"
      style={{
        background: `conic-gradient(var(--color-success) 0 ${pct}%, var(--color-muted) ${pct}% 100%)`,
      }}
    >
      <span className="flex size-icon-xl items-center justify-center rounded-full bg-card font-mono text-[10px] text-success-text">
        {pct}
      </span>
    </span>
  );
}

/** Call-volume pulse; normalized 0-100 series. */
function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const w = 100;
  const h = 28;
  const step = w / (series.length - 1);
  const pts = series.map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / 100) * (h - 4)).toFixed(1)}`);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="h-[28px] w-full" aria-hidden="true">
      <polyline
        points={`0,${h} ${pts.join(" ")} ${w},${h}`}
        fill="var(--color-primary)"
        fillOpacity="0.10"
        stroke="none"
      />
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Work mix: one bar, three tones - in-flight / pending / failed. */
function WorkMix({ inflight, pending, failed }: { inflight: number; pending: number; failed: number }) {
  const total = Math.max(inflight + pending + failed, 1);
  const seg = (n: number) => `${(n / total) * 100}%`;
  return (
    <span aria-hidden="true" className="flex h-[8px] w-full overflow-hidden rounded-full bg-muted">
      <span className="h-full bg-primary" style={{ width: seg(inflight) }} />
      <span className="h-full bg-warning" style={{ width: seg(pending) }} />
      <span className="h-full bg-destructive" style={{ width: seg(failed) }} />
    </span>
  );
}

/** Figures under a chart: key muted, value mono, tone-lit where it matters. */
function Figures({ items }: { items: { k: string; v: string; tone?: "warning" | "danger" | "success" }[] }) {
  const tone = { warning: "text-warning-text", danger: "text-destructive-text", success: "text-success-text" };
  return (
    <span className="flex flex-wrap items-baseline gap-x-sm gap-y-2xs text-label-sm">
      {items.map((i) => (
        <span key={i.k} className="whitespace-nowrap text-muted-foreground">
          {i.k}
          <span className={`ml-2xs font-mono ${i.tone ? tone[i.tone] : "text-foreground"}`}>{i.v}</span>
        </span>
      ))}
    </span>
  );
}

function CardBody({ item, shell }: { item: NavItem; shell: ShellData | null }) {
  if (!shell) return <span className="text-label-sm text-muted-foreground">读取中…</span>;
  switch (item.key) {
    case "overview":
      return (
        <span className="flex items-center gap-md">
          <CoverageRing pct={shell.overview.coveragePct} />
          <Figures
            items={[
              { k: "资产", v: String(shell.overview.assetCount) },
              { k: "覆盖", v: `${shell.overview.coveragePct}%`, tone: "success" },
            ]}
          />
        </span>
      );
    case "channels":
      return (
        <span className="flex flex-col gap-2xs">
          <Sparkline series={shell.channels.spark} />
          <Figures
            items={[
              { k: "今日调用", v: shell.channels.todayCalls.toLocaleString() },
              { k: "环比", v: `+${shell.channels.deltaPct}%`, tone: "success" },
            ]}
          />
        </span>
      );
    case "pipeline":
      return (
        <span className="flex flex-col gap-xs">
          <WorkMix
            inflight={shell.pipeline.inflight}
            pending={shell.pipeline.pending}
            failed={shell.pipeline.failedResident}
          />
          <Figures
            items={[
              { k: "在制", v: String(shell.pipeline.inflight) },
              { k: "待确认", v: String(shell.pipeline.pending), tone: "warning" },
              { k: "失败", v: String(shell.pipeline.failedResident), tone: "danger" },
            ]}
          />
        </span>
      );
    default: {
      // 验证评测: the verified share as a single bar - the one number this
      // domain exists to move.
      const e = shell.evaluation;
      return (
        <span className="flex flex-col gap-2xs">
          <span aria-hidden="true" className="flex h-[8px] w-full overflow-hidden rounded-full bg-muted">
            <span className="h-full bg-success" style={{ width: `${e.coveragePct}%` }} />
          </span>
          <Figures
            items={[
              { k: "覆盖", v: `${e.coveragePct}%`, tone: "success" },
              { k: "待复验", v: String(e.stale), tone: "warning" },
              { k: "缺口", v: String(e.gaps) },
            ]}
          />
        </span>
      );
    }
  }
}

export function NavRail({
  active,
  pathname,
  shell,
  collapsed,
}: {
  active: string | null;
  pathname: string;
  shell: ShellData | null;
  collapsed: boolean;
}) {
  const [closed, setClosed] = useState<Set<string>>(() => new Set());

  // Read after mount only: localStorage does not exist during SSR, so the
  // first frame must match the server (everything open - the default).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setClosed(new Set(parsed));
    } catch {
      // Storage unavailable: stay with everything open.
    }
  }, []);

  const toggleCard = useCallback((key: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // Best-effort persistence only.
      }
      return next;
    });
  }, []);

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Collapsed = gone. Not a 64px icon rail, not width:0 - the rail unmounts
  // entirely (owner), the DS `ShellSidebarFrame` "hidden" semantics.
  if (collapsed) return null;

  return (
    // pt-lg matches the content column's own pt-lg, so the first card's top
    // edge lines up with the page head beside it.
    <div className="flex h-full w-[16.5rem] shrink-0 flex-col gap-sm overflow-y-auto px-md pb-lg pt-lg">
      {NAV_ITEMS.map((item) => {
        const domainActive = isActive(item.href);
        const open = !closed.has(item.key);

        return (
          // ACTIVE lives on the card: brand hairline + a brand-tinted veil over
          // the translucent surface. No highlight bar behind the title.
          <div
            key={item.key}
            className={`flex shrink-0 flex-col overflow-hidden rounded-lg border transition-colors duration-fast ease-standard ${
              domainActive
                ? "border-primary/40 bg-primary/[0.07]"
                : "border-primary/10 bg-card/60 hover:bg-card dark:border-primary/20"
            }`}
          >
            <div className="flex items-center gap-2xs pr-2xs">
              <Link
                href={item.href}
                aria-current={domainActive ? "page" : undefined}
                className="flex min-h-control-lg min-w-0 flex-1 items-center gap-xs pl-sm text-label-md"
              >
                <Icon
                  name={item.icon}
                  size="sm"
                  className={domainActive ? "text-primary" : "text-muted-foreground"}
                />
                {/* Light title: it names the card, the chart is the loud part. */}
                <span className={`min-w-0 flex-1 truncate ${domainActive ? "text-primary-text" : "text-foreground"}`}>
                  {item.label}
                </span>
              </Link>
              <button
                onClick={() => toggleCard(item.key)}
                aria-expanded={open}
                aria-label={`${open ? "收起" : "展开"}${item.label}`}
                className="flex size-control-md shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors duration-fast ease-standard hover:text-foreground"
              >
                <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
              </button>
            </div>

            {open && (
              <div className="flex flex-col gap-xs px-sm pb-sm pt-2xs">
                <CardBody item={item} shell={shell} />
                {item.sub && (
                  <div className="-mx-2xs flex flex-col border-t border-dashed border-primary/10 pt-2xs dark:border-primary/20">
                    {item.sub.map((s) => {
                      const subActive = isActive(s.href);
                      return (
                        <Link
                          key={s.key}
                          href={s.href}
                          aria-current={subActive ? "page" : undefined}
                          className={`flex min-h-control-sm items-center rounded-md px-2xs text-label-sm transition-colors duration-fast ease-standard ${
                            subActive
                              ? "text-primary-text"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {s.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
