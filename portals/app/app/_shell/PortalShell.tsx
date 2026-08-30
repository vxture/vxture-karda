"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ShellPageContainer, ShellViewport } from "@vxture/design-system";
import { AppHeader } from "./AppHeader";
import { NavPane } from "./NavPane";
import { ShellBackdrop } from "./ShellBackdrop";
import { AgentHub } from "./AgentHub";
import { PORTAL_FULLSCREEN_ID } from "./nav";
import type { ShellData } from "../kb/demo/shell-types";

// The portal shell (owner 2026-08-24): a 48px 顶栏 over the 工作区.
//
// 工作区 (shell body) = everything below the 顶栏, holding three panes:
//   导航栏 (nav pane)     280px, collapsible - unmounts, no icon strip left
//   内容区 (main pane)    scrolls on its own, the fullscreen target
//   智枢 (agent hub) 320px, collapses INTO the 顶栏's ai icon, which then
//                        carries the red pending badge
// Pane visibility persists per-browser; chrome data comes from ONE fetch
// (/api/shell). The full vocabulary is defined once at the top of NavPane.tsx
// and is the only wording used product-wide - no "rail" / "flank" / "column".

const LEFT_KEY = "karda-shell-nav";
const DOCK_KEY = "karda-shell-dock";

function readPref(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

function writePref(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // Best-effort persistence only.
  }
}

export function PortalShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [shell, setShell] = useState<ShellData | null>(null);
  // SSR renders the default (both side panes open); the persisted
  // preference applies after mount to keep hydration consistent.
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [hubOpen, setHubOpen] = useState(true);

  useEffect(() => {
    setNavCollapsed(readPref(LEFT_KEY, false));
    setHubOpen(readPref(DOCK_KEY, true));
  }, []);

  useEffect(() => {
    fetch("/api/shell", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return; // unauthenticated: chrome renders without figures
        setShell((await res.json()) as ShellData);
      })
      .catch(() => {});
  }, [pathname]);

  const toggleNav = useCallback(() => {
    setNavCollapsed((c) => {
      writePref(LEFT_KEY, !c);
      return !c;
    });
  }, []);
  const toggleHub = useCallback(() => {
    setHubOpen((o) => {
      writePref(DOCK_KEY, !o);
      return !o;
    });
  }, []);

  return (
    // No opaque background on the shell itself: the body carries the ground and
    // ShellBackdrop washes it (bg-transparent below overrides the Viewport's
    // bg-background for the same reason).
    <div id={PORTAL_FULLSCREEN_ID} className="relative text-foreground">
      <ShellBackdrop />
      {/* 工作区几何归 DS ShellViewport 所有(owner 2026-08-31,KD-226):header
          之下一行 flex,无外包裹 padding、无栏间距,三块齐平各自内供留白——
          侧栏 Frame(Viewport 自带)管宽度状态机,内容区 ShellPageContainer 管
          流体 page-inset + 封顶行宽 + 居中,智枢 ShellDock 管面与宽。
          2026-08-25 的 24/32 手搓刻度(p-lg/gap-xl)是为浮卡形制定的,随手搓
          包裹层一起退役;标准件的几何前提是贴缘贯通,垫在 24px 里就是
          「位置不正确」本身。 */}
      <ShellViewport
        className="bg-transparent"
        header={
          <AppHeader
            pending={shell?.agent.pending ?? 0}
            hubOpen={hubOpen}
            onToggleHub={toggleHub}
          />
        }
        sidebar={<NavPane collapsed={navCollapsed} onToggleCollapsed={toggleNav} />}
        sidebarMode={navCollapsed ? "collapsed" : "expanded"}
        dock={hubOpen ? <AgentHub shell={shell} onClose={toggleHub} /> : undefined}
      >
        {/* @container:页面的列数跟随内容区宽度而非视口(数不清导航栏/智枢
            开合的视口断点画过四列进 840px 的历史,见 assets-client 的算式)。
            gap-md 是页面段落的纵向节奏,沿用原值。内衬/行宽/底部安全区全部
            来自 ShellPageContainer(px-page-inset / pt-page-inset / pb-6xl +
            封顶 wide-2xl),不再手搓。 */}
        <ShellPageContainer className="@container gap-md">{children}</ShellPageContainer>
      </ShellViewport>
    </div>
  );
}
