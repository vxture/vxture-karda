"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { NavPane } from "./NavPane";
import { ShellBackdrop } from "./ShellBackdrop";
import { AgentHub } from "./AgentHub";
import { PORTAL_FULLSCREEN_ID, activeNavKey } from "./nav";
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
  const active = activeNavKey(pathname);
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
    // No opaque background here: the body carries the ground and ShellBackdrop
    // washes it, so every panel above can be translucent and let it through.
    <div id={PORTAL_FULLSCREEN_ID} className="relative flex h-screen flex-col text-foreground">
      <ShellBackdrop />
      <AppHeader
        pending={shell?.agent.pending ?? 0}
        hubOpen={hubOpen}
        onToggleHub={toggleHub}
        navCollapsed={navCollapsed}
        onToggleNav={toggleNav}
      />
      {/* 工作区. Two spacing constants live here and nowhere else, both on the
          Material adaptive-layout scale (owner 2026-08-25):
            外边距 window margin  p-lg  = 24px, all four sides
            栏间距 pane spacer    gap-xl = 32px, between panes
          Written as TOKENS, not literals, on purpose: `lg`/`xl` resolve to
          24/32px at the default density and shrink with the user's density
          preference. A shell frame that stayed at 24/32 while every control
          inside it compacted would read as broken. The pane WIDTHS stay
          literal - they are content-driven (a card column is 280px because of
          what it holds), not rhythm-driven.

          No pane adds edge padding of its own - the 内容区's content inset is
          the single deliberate exception, declared below. */}
      <div className="flex min-h-0 flex-1 gap-xl p-lg">
        {/* 导航栏 paints no surface and draws no border of its own: its cards
            sit straight on the shared ground (owner 2026-08-24). Only 智枢
            keeps a pane surface - it is a panel over the page, not part of
            it. */}
        <NavPane active={active} pathname={pathname} shell={shell} collapsed={navCollapsed} />
        {/* 内容区: scrolls on its own inside the 工作区. NO background of its
            own - the product backdrop must read through the whole body, not
            stop at 导航栏. It is no longer the fullscreen target either (that
            moved to the shell root), so the hand-rolled `fixed inset-0` layer
            that used to live here is gone, and with it the only place this
            file painted a ground. */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {/* 内衬 content inset: px-md = 16px, the ONE edge padding a pane adds
              on top of the 工作区 constants. It puts the reading column 48px
              clear of 导航栏 and of 智枢 (32px pane spacer + 16px inset) -
              the side panes sit at the window margin, the content deliberately
              does not (owner 2026-08-25). pb keeps a safe run-out under the
              last section.

              @container makes this element the query context for everything
              the pages render: their column counts must follow the WIDTH OF
              THIS PANE, not the viewport. A viewport breakpoint cannot see
              that 导航栏 and 智枢 are open, which is exactly how a 1600px
              window ended up drawing four columns into an 840px pane. Pages
              query it with `@min-[Nrem]:`; the arithmetic behind each
              threshold is written out at the asset grid in
              (portal)/assets/assets-client.tsx. */}
          <div className="@container flex w-full flex-col gap-md px-md pb-5xl">{children}</div>
        </main>
        {hubOpen && <AgentHub shell={shell} onClose={toggleHub} />}
      </div>
    </div>
  );
}
