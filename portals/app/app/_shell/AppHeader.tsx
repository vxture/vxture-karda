"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Icon,
  ShellBrand,
  ShellFullscreenToggle,
  ShellHeader,
  ShellIconButton,
  ShellIconGroup,
  ShellLauncher,
  ShellPanelSlots,
  ShellPreferencePanel,
  ShellSearchBox,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";
import { getSession, loginHref, type SessionUser } from "../console/_lib/api";
import { NAV_ITEMS, PORTAL_FULLSCREEN_ID, activeNavKey } from "./nav";
import { isLocale, useLocale } from "./locale";
import { ScopePanel } from "./ScopePanel";

// The unified product header (owner, 2026-08-21). Structure follows the
// arda-header shell: launcher + brand + menu area (left) / search (center slot,
// pushed to the tool edge) / system icons + user menu (right).
//
// The container is the DS `ShellHeader` (design-ui layout) rather than a
// hand-rolled <header>: it owns the height token and the SHELL MATERIAL, and
// that material is a deliberate DS rule (ShellLayout.tsx header note) - header,
// popovers and cards all sit on `--card` while the page body is one step
// darker, so the layers separate by colour + `shadow-sticky`, NEVER by a
// hairline border. The previous `border-b border-border bg-background` did the
// opposite on both counts: same colour as the body, separated by a rule.
// Height stays `md` = --spacing-header-md = 12 * 4px = 48px.
//
// Preferences (theme / density / font size / language) live in the user
// panel's settings section via ShellPreferencePanel. Theme + density + font
// size are DS-managed (useTheme, persisted under the DS contract keys);
// language is the shell-local LocaleProvider (zh-CN default).

const PREF_LABELS = {
  title: "偏好设置",
  locale: "语言",
  theme: "主题",
  density: "密度",
  fontSize: "字号",
  themeOptions: { light: "浅色", dark: "深色", system: "跟随系统" },
  densityOptions: { compact: "紧凑", default: "默认", comfortable: "舒适" },
  fontSizeOptions: { small: "小", default: "默认", large: "大" },
} as const;

const LOCALE_OPTIONS = [
  { locale: "zh-CN" as const, nativeName: "简体中文" },
  { locale: "en-US" as const, nativeName: "English" },
];

export function AppHeader({
  pending = 0,
  dockOpen = false,
  onToggleDock = () => {},
  navCollapsed = false,
  onToggleNav = () => {},
}: {
  /** 待裁决 count for the steward-dock badge (red, shown when dock closed). */
  pending?: number;
  dockOpen?: boolean;
  onToggleDock?: () => void;
  navCollapsed?: boolean;
  onToggleNav?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode, density, setDensity, fontSize, setFontSize } = useTheme();
  const { locale, setLocale } = useLocale();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => {
    getSession()
      .then((s) => setUser(s.authenticated ? (s.user ?? null) : null))
      .catch(() => setUser(null))
      .finally(() => setSessionLoaded(true));
  }, []);

  const active = activeNavKey(pathname ?? "/");

  const searchGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pages = NAV_ITEMS.filter((n) => !q || n.label.toLowerCase().includes(q)).map((n) => ({
      key: n.key,
      label: n.label,
      description: n.description,
      icon: n.icon,
      onSelect: () => router.push(n.href),
    }));
    const actions = [
      {
        key: "bench",
        label: "检验台",
        description: "以 Agent 同款检索链路试问,验收供给质量",
        icon: "sparkles" as const,
        onSelect: () => router.push("/console/search"),
      },
      {
        key: "console",
        label: "知识库控制台",
        description: "库与文档的管理入口",
        icon: "folder-open" as const,
        onSelect: () => router.push("/console"),
      },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));
    const groups = [];
    if (pages.length) groups.push({ key: "pages", heading: "页面", items: pages });
    if (actions.length) groups.push({ key: "actions", heading: "动作", items: actions });
    return groups;
  }, [query, router]);

  const displayName = user?.sub ?? "未登录";
  const roleLabel = user?.isWorkspaceOwner ? "工作区属主" : user?.canManage ? "管理员" : "成员";

  // Domain navigation lives in the 导航栏 cards, so the 顶栏 keeps only
  // launcher + brand - two navs must not coexist.
  const leading = (
    <>
      {/* 导航栏 toggle, leftmost in the 顶栏 (owner 2026-08-24) - everything
          else shifts right behind it. Kept very light: it governs chrome, not
          content, so it must not compete with the brand beside it. */}
      <ShellIconButton
        icon="sidebar"
        label={navCollapsed ? "展开导航" : "收起导航"}
        onClick={onToggleNav}
        iconClassName="text-muted-foreground/60"
      />
      <ShellLauncher
        buttonLabel="切换功能域"
        panelLabel="功能域"
        items={NAV_ITEMS.map((n) => ({
          key: n.key,
          icon: n.icon,
          label: n.label,
          description: n.description,
          active: n.key === active,
        }))}
        onSelect={(key) => {
          const item = NAV_ITEMS.find((n) => n.key === key);
          if (item) router.push(item.href);
        }}
      />
      <ShellBrand href="/" label={BRAND.shortName} logoSrc="/brand/vxture-logo.png" />
      <span className="h-lg w-px bg-border" aria-hidden="true" />
      <ScopePanel user={user} />
    </>
  );

  // Trailing follows the Console header's three blocks, gap-md between them,
  // gap-2xs inside a group: [助手] · [系统工具组] · [账户]. Do not fold the
  // assistant into the icon group - it is its own block, one size larger.
  const trailing = (
    <div className="flex items-center gap-md">
      {/* 助手:独立入口,比工具组图标大一号(md=20px vs sm=16px)。收起时
          红底角标标明待办数(owner 2026-08-24)。 */}
      <span className="relative">
        <ShellIconButton icon="sparkles" label="管家值班台" active={dockOpen} onClick={onToggleDock}>
          <Icon name="sparkles" size="md" className="text-ai-text" />
        </ShellIconButton>
        {pending > 0 && !dockOpen && (
          <span
            aria-label={`${pending} 项待裁决`}
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-2xs font-mono text-code-sm font-semibold text-white"
          >
            {pending}
          </span>
        )}
      </span>
      {/* 系统工具四元:全屏 / 帮助 / 通知 / 设置。全屏领头(owner 2026-08-24)——
          它作用于当前视图,与后面三个"打开别处"的入口不是一类。全屏走 DS 的
          ShellFullscreenToggle,目标是内容区(PORTAL_FULLSCREEN_ID),所以进入
          全屏后留下的是内容本身,不是连同外壳一起放大。 */}
      <ShellIconGroup label="系统">
        <ShellFullscreenToggle
          targetId={PORTAL_FULLSCREEN_ID}
          enterLabel="全屏"
          exitLabel="退出全屏"
        />
        <ShellIconButton icon="help" label="帮助" />
        <ShellIconButton icon="bell" label="通知" />
        <ShellIconButton icon="settings" label="设置" onClick={() => router.push("/console")} />
      </ShellIconGroup>
      <ShellUserMenu
          user={{
            displayName,
            uniqueLine: user?.activeWorkspace ? `工作区 ${user.activeWorkspace.slice(0, 8)}` : undefined,
            statusTag: sessionLoaded && user ? { label: "已登录", verified: true } : undefined,
          }}
          openLabel="账户"
          online={Boolean(user)}
          settings={
            <ShellPreferencePanel
              locale={locale}
              localeOptions={LOCALE_OPTIONS}
              theme={mode}
              density={density}
              fontSize={fontSize}
              showDensity
              showFontSize
              labels={PREF_LABELS}
              // The DS panel hands back a bare string (its locale list is open);
              // re-narrow before it reaches shell state.
              onLocaleChange={(next) => {
                if (isLocale(next)) setLocale(next);
              }}
              onThemeChange={(t) => setMode(t)}
              onDensityChange={setDensity}
              onFontSizeChange={setFontSize}
            />
          }
          // Role slots, same grammar as the Console user panel: the earned
          // slot lights up, the rest stay locked rather than inventing a level.
          extras={
            <ShellPanelSlots
              label="等级"
              leadIcon="medal"
              lead="row"
              slots={[
                { key: "role", icon: "user", label: `角色 · ${roleLabel}`, earned: Boolean(user) },
                { key: "level", icon: "star", label: "未解锁" },
                { key: "slot-3", icon: "medal", label: "未解锁" },
              ]}
            />
          }
          links={
            user
              ? [{ key: "console", label: "知识库控制台", href: "/console", icon: "folder-open" as const }]
              : [{ key: "login", label: "登录", href: loginHref(pathname ?? "/"), icon: "user" as const }]
          }
          actions={
            user
              ? [
                  {
                    key: "switch-user",
                    label: "切换账号",
                    icon: "user-switch" as const,
                    onClick: () => {
                      window.location.href = "/auth/logout";
                    },
                  },
                  {
                    key: "sign-out",
                    label: "退出登录",
                    icon: "sign-out" as const,
                    danger: true,
                    onClick: () => {
                      window.location.href = "/auth/logout";
                    },
                  },
                ]
              : []
          }
        />
    </div>
  );

  return (
    <ShellHeader
      height="md"
      // Translucent over the product backdrop (owner 2026-08-24): the wash
      // reads through every panel. backdrop-blur keeps the header legible
      // while content scrolls beneath it.
      className="bg-card/70 backdrop-blur-sm"
      // The search is a tool, not the visual focus of this product's header -
      // the four functional domains are. `end` reads the header as "identity
      // left, tools right" and groups the search with the right-hand cluster.
      centerAlign="end"
      leading={leading}
      center={
        <div className="w-[18rem] max-w-[40vw]">
          <ShellSearchBox
            query={query}
            onQueryChange={setQuery}
            groups={searchGroups}
            labels={{ placeholder: "搜索资产、条目", empty: "没有匹配的结果", resultsLabel: "搜索结果" }}
          />
        </div>
      }
      trailing={trailing}
    />
  );
}
