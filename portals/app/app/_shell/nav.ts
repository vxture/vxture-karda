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
  // 首页与知识资产分开(KD-214,owner 2026-08-27)。此前 `/` 兼任两者,于是
  // 「这套基础设施此刻能不能用」没有地方说——语料为零时,资产总览显示的是一批
  // 「有库、没内容」的库,读起来像没人上传东西。见 150-page-architecture §2。
  { key: "home", href: "/", icon: "home", labelKey: "navHome", descKey: "navHomeDesc", sub: [] },
  { key: "overview", href: "/assets", icon: "squares-four", labelKey: "navAssets", descKey: "navAssetsDesc", sub: [] },
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

/**
 * 侧栏(DS `ShellSidebarNav`)的分组结构——**导航栏的新单一来源**(owner 2026-08-30:
 * 导航改用 DS 标准件,参考 opera 的双行形制)。
 *
 * 与 `NAV_ITEMS` 并存而不是替换:启动器与首页域卡仍按「四个域」的扁平表消费,
 * 侧栏按「组 + 项」的标准形制消费——两者都从本文件出,词都在 shell 目录里,
 * 不会漂成两套 IA。
 *
 * `subLabel` 是**英文原词**,照 opera 规则一:中文主名给人读,英文原词给人对上
 * 路由与 API——它们是词表标识不是散文,所以是数据常量,不进 i18n 目录(与错误码
 * 同一条「码在线上,散文在调用点」)。
 */
export interface NavSectionDef {
  /** 分组标题的目录键。 */
  titleKey: ShellKey;
  /** 在本组之前画层级分隔线(DS 语义:分层,不是装饰)。 */
  dividerBefore?: boolean;
  items: readonly {
    key: string;
    href: string;
    icon: IconName;
    labelKey: ShellKey;
    /** 英文原词,双行的第二行。 */
    subLabel: string;
  }[];
}

export const NAV_SECTIONS = [
  {
    titleKey: "navGroupOverview",
    dividerBefore: false,
    items: [
      { key: "home", href: "/", icon: "home", labelKey: "navHome", subLabel: "Home" },
      { key: "assets", href: "/assets", icon: "squares-four", labelKey: "navAssets", subLabel: "Assets" },
    ],
  },
  {
    titleKey: "navChannels",
    dividerBefore: true,
    items: [
      { key: "channels", href: "/channels", icon: "plugs-connected", labelKey: "subChannelsOverview", subLabel: "Channels" },
      { key: "tools", href: "/tools", icon: "api", labelKey: "subTools", subLabel: "Tools" },
      { key: "bench", href: "/bench", icon: "terminal", labelKey: "subBench", subLabel: "Bench" },
    ],
  },
  {
    titleKey: "navPipeline",
    dividerBefore: false,
    items: [
      { key: "pipeline", href: "/pipeline", icon: "workflow", labelKey: "subFlow", subLabel: "Pipeline" },
      { key: "tasks", href: "/pipeline/tasks", icon: "rows", labelKey: "subTasks", subLabel: "Tasks" },
      { key: "rebuild", href: "/pipeline/rebuild", icon: "refresh", labelKey: "subRebuild", subLabel: "Rebuild" },
    ],
  },
  {
    titleKey: "navEvaluation",
    dividerBefore: false,
    items: [
      { key: "evaluation", href: "/evaluation", icon: "list-checks", labelKey: "subEvaluation", subLabel: "Evaluation" },
      { key: "queue", href: "/evaluation/queue", icon: "clock-counter-clockwise", labelKey: "subQueue", subLabel: "Queue" },
      { key: "sets", href: "/evaluation/sets", icon: "clipboard", labelKey: "subSets", subLabel: "Sets" },
    ],
  },
] as const satisfies readonly NavSectionDef[];

/** 侧栏项的激活判定:`/` 只精确匹配,其余按前缀——`/assets/xxx` 亮「知识资产」。 */
export function navHrefActive(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

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
