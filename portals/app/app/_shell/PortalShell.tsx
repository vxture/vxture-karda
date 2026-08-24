"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./AppHeader";
import { NavRail } from "./NavRail";
import { StewardDock } from "./StewardDock";
import { activeNavKey } from "./nav";
import type { ShellData } from "../kb/demo/shell-types";

// The V3 指挥台 portal shell (owner 2026-08-24): header (48px) over a
// three-pane row - left nav-rail cards (collapsible to a 64px icon rail),
// the scrolling content column, and the steward duty desk (collapsible INTO
// the header's ai icon, which then carries the red pending badge). Rail
// states persist per-browser; chrome data comes from ONE fetch (/api/shell).

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
  // SSR renders the default (rail expanded, dock open); the persisted
  // preference applies after mount to keep hydration consistent.
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);

  useEffect(() => {
    setNavCollapsed(readPref(LEFT_KEY, false));
    setDockOpen(readPref(DOCK_KEY, true));
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
  const toggleDock = useCallback(() => {
    setDockOpen((o) => {
      writePref(DOCK_KEY, !o);
      return !o;
    });
  }, []);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <AppHeader
        pending={shell?.steward.pending ?? 0}
        dockOpen={dockOpen}
        onToggleDock={toggleDock}
        navCollapsed={navCollapsed}
        onToggleNav={toggleNav}
      />
      <div className="flex min-h-0 flex-1">
        {/* The nav rail paints no surface and draws no border: it shares the
            content column's ground so the left side reads as one continuous
            plane (owner 2026-08-24). Only the steward dock keeps a surface -
            it is a panel over the page, not part of it. */}
        <NavRail active={active} pathname={pathname} shell={shell} collapsed={navCollapsed} />
        {/* Content column: the global edge padding + section rhythm live here
            (moved from the old single-column layout), scrolling on its own. */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="flex w-full flex-col gap-lg px-xl pb-6xl pt-lg">{children}</div>
        </main>
        {dockOpen && <StewardDock shell={shell} onClose={toggleDock} />}
      </div>
    </div>
  );
}
