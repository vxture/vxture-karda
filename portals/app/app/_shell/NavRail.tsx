"use client";

import Link from "next/link";
import { ShellSidebarFrame, ShellSidebarNav, type ShellNavSection } from "@vxture/design-system";
import { NAV_ITEMS, type NavItem } from "./nav";
import type { ShellData } from "../kb/demo/shell-types";

// LEFT rail of the V3 指挥台 shell. Composed from the DS pair rather than
// hand-rolled markup (the first attempt invented its own rail and its own
// collapse button - wrong on both counts): `ShellSidebarFrame` (design-ui)
// owns the width state machine, `ShellSidebarNav` (design-system) is the
// content - it brings the borderless ghost collapse toggle in the title row,
// group collapse-all, tooltips in the collapsed state and its own group
// persistence, all on DS tokens.
//
// The owner's "cards, not a plain list" reads onto the DS two-line nav item:
// `label` is the domain title and `subLabel` the live summary line, so each
// entry states its situation (12 资产 · 覆盖 82% / 待确认 5 · 失败 6) and
// navigating is the incidental click. The active domain contributes a second
// section carrying its sub-views.

function summaryFor(item: NavItem, shell: ShellData | null): string | undefined {
  if (!shell) return undefined;
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

  const sections: ShellNavSection[] = [
    {
      title: "功能域",
      items: NAV_ITEMS.map((n) => {
        const sub = summaryFor(n, shell);
        return {
          href: n.href,
          label: n.label,
          icon: n.icon,
          ...(sub ? { subLabel: sub } : {}),
        };
      }),
    },
  ];

  if (activeItem?.sub) {
    sections.push({
      title: activeItem.label,
      dividerBefore: true,
      items: activeItem.sub.map((s) => ({ href: s.href, label: s.label, icon: activeItem.icon })),
    });
  }

  // Exact-match "/" so the overview entry does not light up on every route;
  // deeper hrefs match by prefix so /pipeline/tasks/:id keeps 任务与队列 lit.
  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <ShellSidebarFrame mode={collapsed ? "collapsed" : "expanded"}>
      <ShellSidebarNav
        domainName="指挥台"
        sections={sections}
        collapsed={collapsed}
        onToggleCollapsed={onToggle}
        isActive={isActive}
        storageKeyPrefix="karda-shell-nav"
        linkComponent={Link}
      />
    </ShellSidebarFrame>
  );
}
