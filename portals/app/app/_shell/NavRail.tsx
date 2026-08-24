"use client";

import Link from "next/link";
import {
  Icon,
  ShellIconButton,
  ShellSidebarFrame,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@vxture/design-system";
import { NAV_ITEMS, type NavItem } from "./nav";
import type { ShellData } from "../kb/demo/shell-types";

// LEFT rail of the V3 指挥台 shell.
//
// `ShellSidebarFrame` (design-ui) still owns the width state machine. The
// CONTENT is composed here rather than via `ShellSidebarNav` because that
// component's anatomy is fixed around a domain-title row plus per-group
// header rows, and this rail carries no name at all (owner 2026-08-24) - the
// toggle sits alone above a divider. What is NOT re-invented is the item
// vocabulary: the row classes below are DS's `NavItemRow` verbatim -
// `bg-surface-selected text-primary-text` when active, `hover:bg-accent
// hover:text-foreground` otherwise, 40px rail, two-line label + mono subLabel
// - so hover/active reads identically to every other portal's sidebar.
//
// The rail paints NO surface of its own: it shares the content column's
// `bg-background` and carries no right border, so the shell reads as one
// continuous plane (owner 2026-08-24).

/** DS NavItemRow's rail: a fixed 40px icon track that anchors the icon column. */
function Rail({ children }: { children: React.ReactNode }) {
  return <span className="flex size-control-xl shrink-0 items-center justify-center">{children}</span>;
}

function summaryFor(item: NavItem, shell: ShellData | null): string | null {
  if (!shell) return null;
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

function NavRow({
  href,
  icon,
  label,
  subLabel,
  active,
  collapsed,
}: {
  href: string;
  icon: NavItem["icon"];
  label: string;
  subLabel?: string | null;
  active: boolean;
  collapsed: boolean;
}) {
  const row = (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-control-xl items-center gap-xs rounded-md text-label-md transition-colors duration-fast ease-standard ${
        active
          ? "bg-surface-selected text-primary-text"
          : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      <Rail>
        <Icon name={icon} size="sm" />
      </Rail>
      {!collapsed && (
        <span className={`min-w-0 flex-1 truncate pr-xs ${!active ? "text-foreground" : ""}`}>
          {subLabel ? (
            <span className="flex flex-col justify-center py-2xs">
              <span className="truncate leading-tight">{label}</span>
              <span className="truncate font-mono text-label-sm leading-tight text-muted-foreground">
                {subLabel}
              </span>
            </span>
          ) : (
            label
          )}
        </span>
      )}
    </Link>
  );
  if (!collapsed) return row;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
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
  const activeItem = NAV_ITEMS.find((n) => n.key === active);
  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <ShellSidebarFrame mode={collapsed ? "collapsed" : "expanded"}>
      {/* TooltipProvider travels with the component that needs it: collapsed
          rows mount Radix tooltips, which throw without a provider. */}
      <TooltipProvider delayDuration={300}>
        <div className="flex h-full flex-col p-xs">
          {/* Toggle row - no domain name (owner: the rail is not "指挥台"),
              closed by a divider instead. */}
          <div className="shrink-0 border-b border-primary/10 pb-xs dark:border-primary/20">
            <ShellIconButton icon="sidebar" label={collapsed ? "展开导航" : "收起导航"} onClick={onToggle}>
              <Icon name="sidebar" size="md" />
            </ShellIconButton>
          </div>

          <nav className="flex min-h-0 flex-1 flex-col gap-2xs overflow-y-auto pt-xs" aria-label="功能域">
            {NAV_ITEMS.map((n) => (
              <NavRow
                key={n.key}
                href={n.href}
                icon={n.icon}
                label={n.label}
                subLabel={summaryFor(n, shell)}
                active={isActive(n.href)}
                collapsed={collapsed}
              />
            ))}

            {/* Sub-view card for the active domain: its own surface (bg-card
                over the shared ground) so it reads as a panel belonging to the
                domain above it, not as more nav rows. */}
            {activeItem?.sub && !collapsed && (
              <div className="mt-xs flex flex-col gap-2xs rounded-lg border border-primary/10 bg-card p-2xs dark:border-primary/20">
                <span className="px-sm pt-2xs font-mono text-[9.5px] tracking-widest text-muted-foreground">
                  {activeItem.label}
                </span>
                {activeItem.sub.map((s) => {
                  const subActive = isActive(s.href);
                  return (
                    <Link
                      key={s.key}
                      href={s.href}
                      aria-current={subActive ? "page" : undefined}
                      className={`flex min-h-control-md items-center rounded-md px-sm text-label-md transition-colors duration-fast ease-standard ${
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
          </nav>
        </div>
      </TooltipProvider>
    </ShellSidebarFrame>
  );
}
