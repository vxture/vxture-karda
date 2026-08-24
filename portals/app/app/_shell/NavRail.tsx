"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@vxture/design-system";
import { NAV_ITEMS, type NavItem } from "./nav";
import type { ShellData } from "../kb/demo/shell-types";

// LEFT rail of the V3 指挥台 shell: FOUR panel cards, one per functional
// domain (owner 2026-08-24), following the Yucer 战情台 flank - the rail
// paints nothing and the cards sit on the shared ground.
//
// Each card is a domain: a head row that navigates (and carries the active
// state) over a body that expands the domain's own figures and second-level
// views. Any card can be collapsed to its title alone when its body is more
// than the moment needs; the state persists per browser.
//
// Interaction vocabulary stays DS's `NavItemRow`: `bg-surface-selected` +
// `text-primary-text` when active, `hover:bg-accent` + `hover:text-foreground`
// otherwise. The rail's width state machine lives in PortalShell, which also
// owns the header toggle that drives it.

const OPEN_KEY = "karda-shell-cards-closed";

interface Metric {
  value: string;
  key: string;
  tone?: "warning" | "danger";
}

function metricsFor(item: NavItem, shell: ShellData | null): Metric[] {
  if (!shell) return [];
  switch (item.key) {
    case "overview":
      return [
        { value: String(shell.overview.assetCount), key: "知识资产" },
        { value: `${shell.overview.coveragePct}%`, key: "验证覆盖" },
      ];
    case "channels":
      return [{ value: shell.channels.todayCalls.toLocaleString(), key: "今日调用" }];
    case "pipeline":
      return [
        { value: String(shell.pipeline.pending), key: "待确认", tone: "warning" },
        { value: String(shell.pipeline.failedResident), key: "失败驻留", tone: "danger" },
        { value: String(shell.pipeline.rebuilding), key: "重建中" },
      ];
    default:
      return [];
  }
}

const TONE_CLASS: Record<NonNullable<Metric["tone"]>, string> = {
  warning: "text-warning-text",
  danger: "text-destructive-text",
};

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
  // first frame must match the server (everything open).
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
  // entirely (owner 2026-08-24), the DS `ShellSidebarFrame` "hidden" semantics:
  // 不加载不消耗资源. Only cards exist, and only when the rail is shown.
  if (collapsed) return null;

  return (
    // pt-lg matches the content column's own pt-lg, so the first card's top
    // edge lines up with the page head beside it rather than floating above it.
    <div className="flex h-full w-[15.5rem] shrink-0 flex-col gap-sm overflow-y-auto px-md pb-lg pt-lg">
        {NAV_ITEMS.map((item) => {
          const domainActive = isActive(item.href);
          const metrics = metricsFor(item, shell);
          const open = !closed.has(item.key);
          const hasBody = metrics.length > 0 || Boolean(item.sub);

          return (
            // One card per domain. Active card lifts its border to the brand
            // so the current domain reads at a glance among four panels.
            <div
              key={item.key}
              className={`flex shrink-0 flex-col overflow-hidden rounded-lg border bg-card ${
                domainActive ? "border-primary/30" : "border-primary/10 dark:border-primary/20"
              }`}
            >
              {/* head: navigates; the caret collapses the body */}
              <div
                className={`flex items-center gap-xs transition-colors duration-fast ease-standard ${
                  domainActive ? "bg-surface-selected" : "hover:bg-accent"
                }`}
              >
                <Link
                  href={item.href}
                  aria-current={domainActive ? "page" : undefined}
                  className={`flex min-h-control-lg min-w-0 flex-1 items-center gap-xs text-label-md ${
                    domainActive ? "text-primary-text" : "text-foreground"
                  }`}
                >
                  <span className="flex size-control-lg shrink-0 items-center justify-center">
                    <Icon name={item.icon} size="sm" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{item.label}</span>
                </Link>
                {hasBody && (
                  <button
                    onClick={() => toggleCard(item.key)}
                    aria-expanded={open}
                    aria-label={`${open ? "收起" : "展开"}${item.label}`}
                    className="flex size-control-md shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:text-foreground"
                  >
                    <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
                  </button>
                )}
                <span className="w-2xs shrink-0" aria-hidden="true" />
              </div>

              {/* Body stays SHORT: figures read as one wrapped line (value +
                  key inline), not stacked metric blocks - four stacked cards
                  in a column cannot each afford two lines per figure. */}
              {hasBody && open && (
                <div className="flex flex-col gap-2xs border-t border-primary/10 px-md py-xs dark:border-primary/20">
                  <span className="flex flex-wrap items-baseline gap-x-sm gap-y-2xs text-label-sm">
                    {metrics.length > 0
                      ? metrics.map((m) => (
                          <span key={m.key} className="whitespace-nowrap text-muted-foreground">
                            {m.key}
                            <span className={`ml-2xs font-mono ${m.tone ? TONE_CLASS[m.tone] : "text-foreground"}`}>
                              {m.value}
                            </span>
                          </span>
                        ))
                      : <span className="text-muted-foreground">基线建设中</span>}
                  </span>
                  {item.sub && (
                    <div className="-mx-2xs flex flex-col">
                      {item.sub.map((s) => {
                        const subActive = isActive(s.href);
                        return (
                          <Link
                            key={s.key}
                            href={s.href}
                            aria-current={subActive ? "page" : undefined}
                            className={`flex min-h-control-sm items-center rounded-md px-2xs text-label-sm transition-colors duration-fast ease-standard ${
                              subActive
                                ? "bg-surface-selected text-primary-text"
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
