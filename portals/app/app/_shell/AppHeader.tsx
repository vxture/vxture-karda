"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ShellBrand,
  ShellHeader,
  ShellIconButton,
  ShellIconGroup,
  ShellLauncher,
  ShellPreferencePanel,
  ShellSearchBox,
  ShellUserMenu,
  useTheme,
} from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";
import { getSession, loginHref, type SessionUser } from "../console/_lib/api";
import { NAV_ITEMS, activeNavKey } from "./nav";
import { isLocale, useLocale } from "./locale";

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

export function AppHeader() {
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

  const leading = (
    <>
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
      <ShellBrand href="/" label={BRAND.shortName} tag="知识服务平台" />
      {/* Brand/menu divider: the one hairline the shell keeps, because it
          separates WITHIN a surface rather than between two layers. */}
      <span aria-hidden="true" className="mx-2xs h-icon-sm w-px bg-border" />
      <nav aria-label="产品导航" className="flex items-center gap-2xs">
        {NAV_ITEMS.map((n) => (
          <Link
            key={n.key}
            href={n.href}
            aria-current={n.key === active ? "page" : undefined}
            // Scale utilities, not bare numerics: px-md/py-2xs and text-body-sm
            // follow the density + font-size preference axes, which `px-3
            // py-1.5 text-sm` did not - at compact density the old chips kept
            // desktop padding while everything around them tightened.
            className={
              n.key === active
                ? "rounded-md bg-primary/10 px-md py-2xs text-body-sm font-medium text-primary"
                : "rounded-md px-md py-2xs text-body-sm text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
            }
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </>
  );

  const trailing = (
    <>
      <ShellIconGroup label="系统">
        <ShellIconButton icon="sparkles" label="知识管家" onClick={() => router.push("/pipeline")} />
        <ShellIconButton icon="bell" label="通知" />
        <ShellIconButton icon="help" label="帮助" />
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
          links={
            user
              ? [{ key: "console", label: "知识库控制台", href: "/console", icon: "folder-open" as const }]
              : [{ key: "login", label: "登录", href: loginHref(pathname ?? "/"), icon: "user" as const }]
          }
          actions={
            user
              ? [
                  {
                    key: "logout",
                    label: "退出登录",
                    icon: "power" as const,
                    danger: true,
                    onClick: () => {
                      window.location.href = "/auth/logout";
                    },
                  },
                ]
              : []
          }
        />
    </>
  );

  return (
    <ShellHeader
      height="md"
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
