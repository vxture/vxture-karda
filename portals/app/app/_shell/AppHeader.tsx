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
import { getSession, loginHref, type SessionUser } from "../_lib/api";
import { NAV_ITEMS, PORTAL_FULLSCREEN_ID, activeNavKey } from "./nav";
import { isLocale, useLocale } from "./locale";
import { useMessages } from "../_i18n/useMessages";
import { common } from "../_i18n/messages/common";
import { shell } from "../_i18n";
import { ScopePanel } from "./ScopePanel";
import { ROLE_LABEL_KEY } from "./roles";
import { sessionRole } from "../_lib/session";

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

const LOCALE_OPTIONS = [
  // i18n-allow: a language picker names each language in its OWN script -
  // 简体中文 stays 简体中文 for an English reader, the way Deutsch stays
  // Deutsch for a Chinese one. Translating it is the bug, not leaving it.
  { locale: "zh-CN" as const, nativeName: "简体中文" },
  { locale: "en-US" as const, nativeName: "English" },
];

export function AppHeader({
  pending = 0,
  hubOpen = false,
  onToggleHub = () => {},
}: {
  /** 待裁决 count for the agent-dock badge (red, shown when dock closed). */
  pending?: number;
  hubOpen?: boolean;
  onToggleHub?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode, setMode, density, setDensity, fontSize, setFontSize } = useTheme();
  const { locale, setLocale } = useLocale();
  const m = useMessages(shell);
  const c = useMessages(common);
  // The DS preference panel takes every label as a prop - DS 8.0.0 has no
  // locale context and will not acquire one, so the whole panel is translated
  // at this call site.
  const prefLabels = useMemo(
    () => ({
      title: m.prefTitle,
      locale: m.prefLanguage,
      theme: m.prefTheme,
      density: m.prefDensity,
      fontSize: m.prefFontSize,
      themeOptions: { light: m.themeLight, dark: m.themeDark, system: m.themeSystem },
      densityOptions: { compact: m.densityCompact, default: m.densityDefault, comfortable: m.densityComfortable },
      fontSizeOptions: { small: m.sizeSmall, default: m.sizeDefault, large: m.sizeLarge },
    }),
    [m],
  );
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
    // Matching is done on the RESOLVED label, so search follows the language
    // the reader is actually looking at - typing "channels" finds 供给通道 in
    // en-US and typing 通道 finds it in zh-CN, rather than one of the two
    // always missing.
    const pages = NAV_ITEMS.map((n) => ({
      key: n.key,
      label: m[n.labelKey],
      description: m[n.descKey],
      icon: n.icon,
      onSelect: () => router.push(n.href),
    })).filter((n) => !q || n.label.toLowerCase().includes(q));
    const actions = [
      {
        key: "bench",
        label: m.subBench,
        description: m.benchDesc,
        icon: "sparkles" as const,
        onSelect: () => router.push("/bench"),
      },
      {
        key: "console",
        label: m.kbConsole,
        description: m.kbConsoleDesc,
        icon: "folder-open" as const,
        onSelect: () => router.push("/assets/new"),
      },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));
    const groups = [];
    if (pages.length) groups.push({ key: "pages", heading: m.groupPages, items: pages });
    if (actions.length) groups.push({ key: "actions", heading: m.groupActions, items: actions });
    return groups;
  }, [query, router]);

  const displayName = user?.sub ?? m.signedOut;
  const roleLabel = m[ROLE_LABEL_KEY[sessionRole(user)]];

  // Domain navigation lives in the 导航栏 cards, so the 顶栏 keeps only
  // launcher + brand - two navs must not coexist.
  const leading = (
    <>
      {/* 导航栏的收放不再从顶栏遥控(owner 2026-08-31):DS 标准导航自带
          收放控件,顶栏那颗 sidebar 图标自 KD-225/KD-226 起就是同一状态的
          第二个开关——两个开关摆两处,读者要猜它们是不是一回事。撤掉后
          顶栏回到「launcher + 品牌」,收放归导航栏自己。 */}
      <ShellLauncher
        buttonLabel={m.launcherLabel}
        panelLabel={m.launcherPanel}
        items={NAV_ITEMS.map((n) => ({
          key: n.key,
          icon: n.icon,
          label: m[n.labelKey],
          description: m[n.descKey],
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
        <ShellIconButton icon="sparkles" label={m.agentName} active={hubOpen} onClick={onToggleHub}>
          <Icon name="sparkles" size="md" className="text-ai-text" />
        </ShellIconButton>
        {pending > 0 && !hubOpen && (
          <span
            aria-label={m.pendingBadge(pending)}
            className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-destructive px-2xs font-mono text-code-sm font-semibold text-white"
          >
            {pending}
          </span>
        )}
      </span>
      {/* 系统工具四元:全屏 / 帮助 / 通知 / 设置。全屏领头(owner 2026-08-24)——
          它作用于当前视图,与后面三个"打开别处"的入口不是一类。

          目标是 SHELL 根(PORTAL_FULLSCREEN_ID),不再是内容区(owner
          2026-08-25):全屏留下的是整个应用——顶栏 + 工作区——而不是把内容
          单独摘出来放大。因此必须走 native:shell 根本来就是 h-screen,伪全屏
          对它是空操作,唯一还能收回的是浏览器自己的边框,只有 Fullscreen API
          拿得到。背景由 DS 的 `:fullscreen` 规则给,不必在这里补——原生全屏
          的元素默认合成在黑底上,少了它整屏会是黑框。 */}
      <ShellIconGroup label={m.system}>
        <ShellFullscreenToggle
          targetId={PORTAL_FULLSCREEN_ID}
          mode="native"
          enterLabel={m.fullscreen}
          exitLabel={m.exitFullscreen}
        />
        <ShellIconButton icon="help" label={m.help} />
        <ShellIconButton icon="bell" label={m.notifications} />
        <ShellIconButton icon="settings" label={m.settings} onClick={() => router.push("/assets/new")} />
      </ShellIconGroup>
      <ShellUserMenu
          user={{
            displayName,
            uniqueLine: user?.activeWorkspace ? m.workspaceLabel(user.activeWorkspace.slice(0, 8)) : undefined,
            statusTag: sessionLoaded && user ? { label: m.signedIn, verified: true } : undefined,
          }}
          openLabel={m.account}
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
              labels={prefLabels}
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
              label={m.tier}
              leadIcon="medal"
              lead="row"
              slots={[
                { key: "role", icon: "user", label: m.roleLine(roleLabel), earned: Boolean(user) },
                { key: "level", icon: "star", label: m.locked },
                { key: "slot-3", icon: "medal", label: m.locked },
              ]}
            />
          }
          links={
            user
              ? [{ key: "assets", label: m.newAsset, href: "/assets/new", icon: "folder-open" as const }]
              : [{ key: "login", label: c.signIn, href: loginHref(pathname ?? "/"), icon: "user" as const }]
          }
          actions={
            user
              ? [
                  {
                    key: "switch-user",
                    label: m.switchAccount,
                    icon: "user-switch" as const,
                    onClick: () => {
                      window.location.href = "/auth/logout";
                    },
                  },
                  {
                    key: "sign-out",
                    label: m.signOut,
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
            labels={{ placeholder: m.searchPlaceholder, empty: m.searchEmpty, resultsLabel: m.searchResults }}
          />
        </div>
      }
      trailing={trailing}
    />
  );
}
