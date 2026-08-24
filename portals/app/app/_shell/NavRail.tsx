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
// Card-mode navigation, following the Yucer 战情台 flank pattern (owner
// reference 2026-08-24): the RAIL itself paints nothing - it is the same
// ground as the content column - and the navigation sits on it as ONE panel
// card. Inside the card, each domain is a row divided from its neighbour by a
// hairline (Yucer's `.sector` + `border-top`), reading "name left, count
// right" with a caret where the row expands. Second-level views expand INLINE
// inside the card under their domain: a second card would have to carry more
// than links to earn its own surface (owner).
//
// The item interaction vocabulary stays DS's `NavItemRow`:
// `bg-surface-selected` + `text-primary-text` active, `hover:bg-accent` +
// `hover:text-foreground` otherwise.
//
// `ShellSidebarFrame` (design-ui) still owns the width state machine.

/** DS NavItemRow's rail: a fixed 40px icon track that anchors the icon column. */
function Rail({ children }: { children: React.ReactNode }) {
  return <span className="flex size-control-xl shrink-0 items-center justify-center">{children}</span>;
}

function summaryFor(item: NavItem, shell: ShellData | null): string | null {
  if (!shell) return null;
  switch (item.key) {
    case "overview":
      return `资产 ${shell.overview.assetCount}`;
    case "channels":
      return `调用 ${shell.channels.todayCalls.toLocaleString()}`;
    case "pipeline":
      return `待确认 ${shell.pipeline.pending}`;
    default:
      return null;
  }
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
  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <ShellSidebarFrame mode={collapsed ? "collapsed" : "expanded"}>
      {/* TooltipProvider travels with the component that needs it: collapsed
          rows mount Radix tooltips, which throw without a provider. */}
      <TooltipProvider delayDuration={300}>
        <div className="flex h-full flex-col gap-sm p-xs">
          {/* Toggle row - no domain name, and no rule under it: the row is
              chrome on the bare ground, a divider only made it look like an
              empty titled section (owner). */}
          <div className="shrink-0">
            <ShellIconButton icon="sidebar" label={collapsed ? "展开导航" : "收起导航"} onClick={onToggle}>
              <Icon name="sidebar" size="md" />
            </ShellIconButton>
          </div>

          {/* The navigation panel: the one card on this rail. */}
          <nav
            aria-label="功能域"
            className="flex min-h-0 flex-1 flex-col overflow-y-auto rounded-lg border border-primary/10 bg-card dark:border-primary/20"
          >
            {!collapsed && (
              <span className="px-md py-sm text-overline text-muted-foreground">功能域</span>
            )}
            {NAV_ITEMS.map((n, i) => {
              const domainActive = isActive(n.href);
              const summary = summaryFor(n, shell);
              const showSub = Boolean(n.sub) && n.key === active && !collapsed;
              // Rows divide from each other with a hairline, and the first row
              // divides from the panel title - Yucer's `.sector` border-top.
              const divide = i > 0 || !collapsed;

              const row = (
                <Link
                  href={n.href}
                  aria-current={domainActive ? "page" : undefined}
                  className={`flex min-h-control-xl items-center gap-xs text-label-md transition-colors duration-fast ease-standard ${
                    divide ? "border-t border-primary/10 dark:border-primary/20" : ""
                  } ${
                    domainActive
                      ? "bg-surface-selected text-primary-text"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  }`}
                >
                  <Rail>
                    <Icon name={n.icon} size="sm" />
                  </Rail>
                  {!collapsed && (
                    <>
                      <span className={`min-w-0 flex-1 truncate font-medium ${!domainActive ? "text-foreground" : ""}`}>
                        {n.label}
                      </span>
                      <span className="flex shrink-0 items-center gap-2xs pr-md">
                        {summary && <span className="font-mono text-label-sm text-muted-foreground">{summary}</span>}
                        {n.sub && (
                          <Icon
                            name={showSub ? "chevron-down" : "chevron-right"}
                            size="xs"
                            className="text-muted-foreground"
                          />
                        )}
                      </span>
                    </>
                  )}
                </Link>
              );

              return (
                <div key={n.key} className="flex flex-col">
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{row}</TooltipTrigger>
                      <TooltipContent side="right">{n.label}</TooltipContent>
                    </Tooltip>
                  ) : (
                    row
                  )}
                  {/* Second-level views, inline inside the card. Labels align
                      to the parent's label column via an empty 40px rail, so
                      the indent comes from the shared grid, not a magic
                      number. */}
                  {showSub &&
                    n.sub?.map((s) => {
                      const subActive = isActive(s.href);
                      return (
                        <Link
                          key={s.key}
                          href={s.href}
                          aria-current={subActive ? "page" : undefined}
                          className={`flex min-h-control-md items-center gap-xs text-label-md transition-colors duration-fast ease-standard ${
                            subActive
                              ? "bg-surface-selected text-primary-text"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          <span className="size-control-xl shrink-0" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate pr-md">{s.label}</span>
                        </Link>
                      );
                    })}
                </div>
              );
            })}
          </nav>
        </div>
      </TooltipProvider>
    </ShellSidebarFrame>
  );
}
