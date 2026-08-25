import type { IconName } from "@vxture/design-system";

/**
 * DOM id of the SHELL ROOT - the fullscreen target (owner 2026-08-25).
 *
 * It used to be the 内容区, so expanding hid the 顶栏 and both side panes and
 * put the reading column alone on the viewport. The owner reversed that: 全屏
 * now means the whole application - 顶栏 + 工作区 - fills the physical screen.
 *
 * That reversal forces NATIVE fullscreen. Pseudo-fullscreen only pins an
 * element to the viewport, and the shell root is already `h-screen`, so
 * pseudo mode against this target would be a no-op: the one thing left to
 * reclaim is the browser's own chrome, and only the Fullscreen API can take
 * it. The header passes `mode="native"`.
 *
 * Shared so the toggle and the element it expands can never drift apart.
 */
export const PORTAL_FULLSCREEN_ID = "karda-portal-shell";

// The product's top-level functional domains (owner, 2026-08-21). They render
// as the 导航栏 cards and the header launcher - the four entries ARE the
// product's information architecture, so this list is the single source both
// of them read from.
export interface NavSubItem {
  key: string;
  href: string;
  label: string;
}

export interface NavItem {
  key: string;
  href: string;
  label: string;
  icon: IconName;
  description: string;
  /** Second-level views, shown under the domain's card in the 导航栏. */
  sub?: readonly NavSubItem[];
}

export const NAV_ITEMS: readonly NavItem[] = [
  { key: "overview", href: "/", label: "知识资产", icon: "squares-four", description: "知识资产的统计、运营与健康" },
  {
    key: "channels",
    href: "/channels",
    label: "供给通道",
    icon: "plugs-connected",
    description: "直供与 Runos 两条供给通道",
    // 工具面 and 检验台 are the CONSUMER-facing half of this domain: what an
    // agent developer can call, and where they try it before integrating. Both
    // existed only as links from other pages until batch 13, which meant the
    // one audience they are for had no way to find them.
    sub: [
      { key: "channels", href: "/channels", label: "通道概览" },
      { key: "tools", href: "/tools", label: "工具面" },
      { key: "bench", href: "/bench", label: "检验台" },
    ],
  },
  {
    key: "pipeline",
    href: "/pipeline",
    label: "加工管道",
    icon: "workflow",
    description: "知识管家驱动的智能加工",
    sub: [
      { key: "flow", href: "/pipeline", label: "加工流水" },
      { key: "tasks", href: "/pipeline/tasks", label: "任务与队列" },
      { key: "rebuild", href: "/pipeline/rebuild", label: "受控重建" },
    ],
  },
  {
    key: "evaluation",
    href: "/evaluation",
    label: "验证评测",
    icon: "list-checks",
    description: "验证、评测与质量基线",
    sub: [
      { key: "evaluation", href: "/evaluation", label: "验证与评测" },
      { key: "queue", href: "/evaluation/queue", label: "待复验队列" },
      { key: "sets", href: "/evaluation/sets", label: "评测集" },
    ],
  },
] as const;

/** Resolve the active nav entry from a pathname ("/" matches only exactly). */
export function activeNavKey(pathname: string): string | null {
  for (const item of NAV_ITEMS) {
    if (item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)) return item.key;
    // A sub-view may live outside its domain's href prefix (/tools and /bench
    // sit under 供给通道 but do not start with /channels). Without this the nav
    // would show NO active domain on those pages.
    if (item.sub?.some((sv) => pathname === sv.href || pathname.startsWith(`${sv.href}/`))) return item.key;
  }
  return null;
}
