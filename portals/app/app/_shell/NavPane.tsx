"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ShellSidebarFrame, ShellSidebarNav } from "@vxture/design-system";
import { NAV_SECTIONS, navHrefActive } from "./nav";
import { useMessages } from "../_i18n/useMessages";
import { shell as shellMessages } from "../_i18n/messages/shell";

// 导航栏 (nav pane) - the left pane of the shell body, now the DS STANDARD
// sidebar (owner 2026-08-30: 把手搓的导航修正为标准规范导航).
//
// 换标准件换掉的是三样手搓品,每一样 DS 都自带且做得更全:
//
//   宽度状态机   之前 collapsed = 整栏卸载(旧裁定);现在走 `ShellSidebarFrame`
//               的 expanded/collapsed:收起是**图标栏**,tooltip 报主名,
//               图标横坐标两态间不跳(DS 注释里那套 justify-start 的坑早踩平了)。
//               旧的「收起=消失」语义就此退役——owner 点名要标准件自带的收放。
//   分组折叠     每组自带 chevron,展开态持久化(storageKeyPrefix 命名空间隔离),
//               还有 title 行 hover 才出现的全组收合。
//   双行形制     opera 规则一:中文主名 + 英文原词(subLabel)。英文对上路由与
//               API 的词表,「与 API 分叉的词表在控制台这头买到的清晰,会在两者
//               相接的每一个点上还回去」。
//
// karda 在标准之上只加**一条**呈现规则(owner 2026-08-30):双行只在「页面激活」
// 或「鼠标/键盘停在项上」时展开,离开即收回单行——导航的常态要安静,英文原词是
// 「停下来对概念」时才需要的。DS 尚无此开关,用一段作用域 CSS 盖在 subLabel 的
// 行上(TD-016:内部 DOM 选择器是借的,已在 vxture-design 提 issue 要一等 prop,
// DS 跟上后删掉 <style> 即可)。
//
// 域徽章(DomainTag 的未读计数)随手搓菜单一起退役:数字已经活在首页域卡与智枢
// 上,菜单回答的是「去哪」,不是「有多少」——这本来就是 KD-215 把卡片请出导航栏
// 的同一条理由,这次走完最后一步。
//
// Shell vocabulary (owner 2026-08-24/25): 顶栏 header · 工作区 shell body ·
// 导航栏 nav pane(本文件) · 内容区 main pane · 智枢 agent hub ·
// 栏间距 32px · 外边距 24px · 内衬 16px。收起态宽度由 Frame 的 token 管。
export function NavPane({
  collapsed,
  onToggleCollapsed,
}: {
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const m = useMessages(shellMessages);
  const pathname = usePathname() ?? "/";

  const sections = NAV_SECTIONS.map((s) => ({
    title: m[s.titleKey],
    dividerBefore: s.dividerBefore ?? false,
    items: s.items.map((i) => ({
      href: i.href,
      label: m[i.labelKey],
      icon: i.icon,
      subLabel: i.subLabel,
    })),
  }));

  return (
    <div data-karda-nav className="flex min-h-0 shrink-0">
      {/* 双行的展开/收回(TD-016 的本地实现):subLabel 是项内唯一的 font-mono,
          未激活且未悬停/未聚焦时隐藏它——行高回到单行,列表安静;hover、键盘
          focus-visible、或 aria-current=page 时第二行浮现。选择器借的是 DS 的
          内部 DOM,升级 DS 时以 vxture-design#9 的一等 prop 替换。 */}
      <style>{`
        [data-karda-nav] a:not(:hover):not(:focus-visible):not([aria-current="page"]) .font-mono {
          display: none;
        }
      `}</style>
      <ShellSidebarFrame mode={collapsed ? "collapsed" : "expanded"}>
        <ShellSidebarNav
          domainName="Karda"
          sections={sections}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          isActive={(href) => navHrefActive(href, pathname)}
          storageKeyPrefix="karda-shell-nav"
          linkComponent={Link}
          labels={{
            expandNav: m.navExpand,
            collapseNav: m.navCollapse,
            expandAllGroups: m.navGroupsExpand,
            collapseAllGroups: m.navGroupsCollapse,
          }}
        />
      </ShellSidebarFrame>
    </div>
  );
}
