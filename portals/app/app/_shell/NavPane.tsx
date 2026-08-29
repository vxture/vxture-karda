"use client";

import Link from "next/link";
import { Icon } from "@vxture/design-system";
import { NAV_ITEMS } from "./nav";
import { useMessages } from "../_i18n/useMessages";
import { shell as shellMessages } from "../_i18n/messages/shell";
import { DomainTag } from "./DomainCard";
import type { ShellData } from "../kb/demo/shell-types";

// 导航栏 (nav pane) - the left pane of the shell body. A STANDARD MENU: one
// row per functional domain, the active domain's views nested under it.
//
// It used to be four chart cards (rings, a pie, bar rows, a split bar). The
// owner retired that on 2026-08-28: **a card is the right shape for a landing
// surface, and the wrong shape for a thing that hangs beside every page**. On
// the 首页 those cards are the content; on `/pipeline/tasks/[id]` they are a
// second dashboard competing with the page you actually opened. So the card
// vocabulary MOVED (`DomainCard.tsx` -> the 首页) rather than being deleted -
// it had been tuned over several rounds and none of that work is thrown away.
// What is left here is what a menu owes: where am I, where else can I go.
//
// Shell vocabulary, product-wide (owner 2026-08-24, spacing revised
// 2026-08-25). Use these words and no synonyms - "rail", "flank", "column",
// "sidebar" are all retired, and so are the casual English placeholders
// ("nav / content / action") the sizes were first discussed in:
//   顶栏 header        the 48px bar (Material: top app bar)
//   工作区 shell body   EVERYTHING below the header - the three panes together
//   导航栏 nav pane     this file, 280px. Not a "rail": Material reserves that
//                      for the 80dp icon strip; a 280px menu column is a pane.
//   内容区 main pane    the middle, scrolling pane (ARIA <main>), width follows
//   智枢 agent hub the right pane, 400px. Named for what it IS - a duty
//                      desk with pending items - not "action pane"; it is a
//                      product surface, not a generic inspector.
//   栏间距 pane spacer  32px between panes (Material pane spacer)
//   外边距 window margin 24px from the browser edge (Material margins)
//   内衬 content inset  16px the 内容区 adds inside its own pane
//
// Collapsed = the pane unmounts entirely (no icon strip left behind).
//
// TYPOGRAPHY: every size here is a DS role (`text-label-md`, `text-body-md`),
// never an arbitrary px - a role lands family/size/weight/line-height together,
// and the user's 字号 preference only moves the roles. Do NOT write
// `leading-none`: under the DS it computes to line-height:0 (the spacing
// namespace fallback) and any box that also clips renders EMPTY.

/** Sub-views are shown for the ACTIVE domain only.
 *
 *  There is no per-card collapse toggle and no `localStorage` any more. The
 *  toggle existed because a card body could be tall enough to be in the way;
 *  a three-row menu group never is, and a control whose only job is to hide
 *  three links costs more attention than the links do. Expanding-on-active is
 *  also the one rule that needs no memory: the menu always agrees with the
 *  page you are on, including on a cold load and in a second tab. */
export function NavPane({
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
  const m = useMessages(shellMessages);

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Collapsed = gone. Not a 64px icon strip, not width:0 - the pane
  // unmounts entirely (owner), the DS `ShellSidebarFrame` "hidden" semantics.
  if (collapsed) return null;

  return (
    // No padding of its own: the window margin owns the outer edge and the
    // pane spacer owns the gap to the 内容区.
    <nav aria-label={m.navLandmark} className="flex w-[17.5rem] shrink-0 flex-col gap-3xs overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        // 域是否当前所在,用 `activeNavKey` 的结果,不用路径前缀:/tools 与
        // /bench 属于供给通道,却不以 /channels 开头——按前缀判断会让那两页在
        // 菜单里没有任何高亮。
        const domainActive = active === item.key;
        const subs = item.sub ?? [];

        return (
          <div key={item.key} className="flex shrink-0 flex-col">
            <Link
              href={item.href}
              aria-current={domainActive ? "page" : undefined}
              className={`flex min-h-control-lg items-center gap-xs rounded-md px-xs text-label-md transition-colors duration-fast ease-standard ${
                domainActive
                  ? "bg-primary/10 text-primary-text"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              <Icon
                name={item.icon}
                size="sm"
                className={domainActive ? "text-primary" : "text-muted-foreground"}
              />
              <span className="min-w-0 flex-1 truncate">{m[item.labelKey]}</span>
              {/* 徽章只说「这个域有东西要看」,是什么由域页面说。菜单里的计数是
                  标准词汇(未读数),与被退掉的图表不是一回事。 */}
              <DomainTag itemKey={item.key} shell={shell} />
            </Link>

            {domainActive && subs.length > 0 ? (
              // 缩进对齐到上一行的文字,不是任意 padding:图标 sm(1rem)+ gap-xs
              // (0.5rem)+ px-xs(0.5rem)= 2rem。对不齐的缩进会让二级看起来像
              // 另一组顶级项。
              <div className="flex flex-col pt-3xs">
                {subs.map((s) => {
                  const subActive = isActive(s.href);
                  return (
                    <Link
                      key={s.key}
                      href={s.href}
                      aria-current={subActive ? "page" : undefined}
                      className={`flex min-h-control-md items-center rounded-md pl-[2rem] pr-xs text-body-md transition-colors duration-fast ease-standard ${
                        subActive
                          ? "font-medium text-primary-text"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      }`}
                    >
                      {m[s.labelKey]}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
