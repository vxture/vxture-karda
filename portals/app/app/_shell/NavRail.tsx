"use client";

import Link from "next/link";
import { Icon } from "@vxture/design-system";
import { NAV_ITEMS, type NavItem } from "./nav";
import type { ShellData } from "../kb/demo/shell-types";

// LEFT rail of the V3 指挥台 shell (owner 2026-08-24): NOT a plain nav list -
// each domain is a CARD carrying title + summary figures + status badges, so
// the rail reads as a situation board and navigation is the incidental click.
// The active domain's card expands its second-level views. Collapsible to a
// 64px icon rail (badges survive the collapse - "where needs attention" must
// stay visible even folded).

function summaryFor(item: NavItem, shell: ShellData | null): string {
  if (!shell) return item.description;
  switch (item.key) {
    case "overview":
      return `${shell.overview.assetCount} 资产 · 覆盖 ${shell.overview.coveragePct}%`;
    case "channels":
      return `今日调用 ${shell.channels.todayCalls.toLocaleString()} 次`;
    case "pipeline":
      return `待确认 ${shell.pipeline.pending} · 失败 ${shell.pipeline.failedResident} · 重建 ${shell.pipeline.rebuilding}`;
    default:
      return "基线建设中";
  }
}

function badgeFor(item: NavItem, shell: ShellData | null): number {
  return item.key === "pipeline" && shell ? shell.pipeline.pending : 0;
}

export function NavRail({
  active,
  pathname,
  shell,
  collapsed,
  onToggle,
}: {
  active: string | null;
  pathname: string;
  shell: ShellData | null;
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={`flex shrink-0 flex-col gap-sm border-r border-primary/10 bg-card px-sm py-md transition-[width] duration-slow ease-standard dark:border-primary/20 ${
        collapsed ? "w-[4rem]" : "w-[15.5rem]"
      }`}
    >
      {!collapsed && (
        <span className="px-sm font-mono text-[9.5px] tracking-widest text-muted-foreground">功能域</span>
      )}
      {NAV_ITEMS.map((item) => {
        const isActive = item.key === active;
        const badge = badgeFor(item, shell);
        if (collapsed) {
          return (
            <Link
              key={item.key}
              href={item.href}
              title={`${item.label} · ${summaryFor(item, shell)}`}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex size-media-xs items-center justify-center self-center rounded-lg transition-colors duration-fast ease-standard ${
                isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              <Icon name={item.icon} size="sm" />
              {badge > 0 && (
                <span className="absolute -right-0.5 -top-0.5 flex h-[14px] min-w-[14px] items-center justify-center rounded-full bg-destructive px-2xs font-mono text-[9px] font-semibold text-white">
                  {badge}
                </span>
              )}
            </Link>
          );
        }
        return (
          <div key={item.key} className="flex flex-col">
            {/* domain card: title + summary; the whole card navigates */}
            <Link
              href={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col gap-2xs rounded-lg border px-md py-sm transition-colors duration-fast ease-standard ${
                isActive
                  ? "border-primary/40 bg-primary/10"
                  : "border-primary/10 hover:bg-accent dark:border-primary/20"
              }`}
            >
              <span className="flex items-center gap-sm">
                <Icon name={item.icon} size="sm" className={isActive ? "text-primary" : "text-muted-foreground"} />
                <span className={`flex-1 truncate text-body-sm font-semibold ${isActive ? "text-primary" : ""}`}>
                  {item.label}
                </span>
                {badge > 0 && (
                  <span className="flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-destructive px-2xs font-mono text-[9.5px] font-semibold text-white">
                    {badge}
                  </span>
                )}
              </span>
              <span className="truncate font-mono text-[10.5px] text-muted-foreground">{summaryFor(item, shell)}</span>
            </Link>
            {/* second-level views under the active card */}
            {isActive && item.sub && (
              <div className="flex flex-col gap-2xs py-2xs pl-xl pr-2xs">
                {item.sub.map((s) => {
                  const subActive = pathname === s.href || (s.href !== item.href && pathname.startsWith(s.href));
                  return (
                    <Link
                      key={s.key}
                      href={s.href}
                      className={`rounded-md px-sm py-2xs text-xs transition-colors duration-fast ease-standard ${
                        subActive
                          ? "bg-primary/10 text-primary"
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
        );
      })}

      <button
        onClick={onToggle}
        className={`mt-auto flex items-center justify-center gap-sm rounded-lg border border-dashed border-primary/10 py-xs text-xs text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground dark:border-primary/20 ${
          collapsed ? "self-center px-xs" : ""
        }`}
        aria-label={collapsed ? "展开导航" : "收起导航"}
      >
        <Icon name={collapsed ? "chevron-right" : "chevron-left"} size="xs" />
        {!collapsed && <span>收起导航</span>}
      </button>
    </div>
  );
}
