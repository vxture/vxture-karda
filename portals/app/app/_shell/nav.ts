import type { IconName } from "@vxture/design-system";
import type { shell } from "../_i18n/messages/shell";

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
// STRUCTURE ONLY - no words. Each entry names the shell-catalog key that
// carries its label (`_i18n/messages/shell.ts`); the words live there.
//
// The binding is a FIELD ON THE ITEM rather than a side table keyed by nav key.
// A side table looked tidier until the sub-views needed one: sub keys are only
// unique within a domain ("channels" and "evaluation" each name both a domain
// and one of its own sub-views), so the table had to be keyed by a
// `domain.sub` pair - and TypeScript cannot see that the `s` in
// `item.sub.map(s => ...)` came from THAT item, so the composite key widened to
// the full cross-product and stopped type-checking. Putting the key on the item
// removes the correlation problem entirely.
//
// They were in BOTH places until 2026-08-25: #136 added the catalog half for
// the header launcher and left this file's Chinese literals in place, so the
// product's information architecture existed twice and nothing checked the two
// agreed. In zh-CN they matched by luck; in en-US the launcher read English
// while the 导航栏 cards stayed Chinese. Keeping the words in exactly one place
// is the fix, and the `satisfies` on each map is what makes a new nav item
// fail to compile until it has one.

type ShellKey = keyof typeof shell;

export interface NavSubItem {
  key: string;
  href: string;
  /** Which shell-catalog entry names this view. */
  labelKey: ShellKey;
}

export interface NavItem {
  key: string;
  href: string;
  icon: IconName;
  labelKey: ShellKey;
  descKey: ShellKey;
  /** Second-level views, shown under the domain's card in the 导航栏. */
  sub?: readonly NavSubItem[];
}

export const NAV_ITEMS = [
  { key: "overview", href: "/", icon: "squares-four", labelKey: "navAssets", descKey: "navAssetsDesc", sub: [] },
  {
    key: "channels",
    href: "/channels",
    icon: "plugs-connected",
    labelKey: "navChannels",
    descKey: "navChannelsDesc",
    // 工具面 and 检验台 are the CONSUMER-facing half of this domain: what an
    // agent developer can call, and where they try it before integrating. Both
    // existed only as links from other pages until batch 13, which meant the
    // one audience they are for had no way to find them.
    sub: [
      { key: "channels", href: "/channels", labelKey: "subChannelsOverview" },
      { key: "tools", href: "/tools", labelKey: "subTools" },
      { key: "bench", href: "/bench", labelKey: "subBench" },
    ],
  },
  {
    key: "pipeline",
    href: "/pipeline",
    icon: "workflow",
    labelKey: "navPipeline",
    descKey: "navPipelineDesc",
    sub: [
      { key: "flow", href: "/pipeline", labelKey: "subFlow" },
      { key: "tasks", href: "/pipeline/tasks", labelKey: "subTasks" },
      { key: "rebuild", href: "/pipeline/rebuild", labelKey: "subRebuild" },
    ],
  },
  {
    key: "evaluation",
    href: "/evaluation",
    icon: "list-checks",
    labelKey: "navEvaluation",
    descKey: "navEvaluationDesc",
    sub: [
      { key: "evaluation", href: "/evaluation", labelKey: "subEvaluation" },
      { key: "queue", href: "/evaluation/queue", labelKey: "subQueue" },
      { key: "sets", href: "/evaluation/sets", labelKey: "subSets" },
    ],
  },
] as const satisfies readonly NavItem[];

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
