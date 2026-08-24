import type { ReactNode } from "react";
import { AppHeader } from "../_shell/AppHeader";
import { LocaleProvider } from "../_shell/locale";

// The product portal shell: the unified 48px header over every top-level
// functional domain (资产总览 / 供给通道 / 加工管道 / 验证评测). The Console
// (/console) keeps its own management shell; contract-facing routes (/status,
// /api/*) are untouched by this group.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <div className="flex min-h-screen flex-col bg-background text-foreground">
        <AppHeader />
        {/* Global content track (owner 2026-08-24): edge padding px-xl (32px)
            and the top/bottom breathing room are defined HERE, once - pages
            must not re-add their own edge padding. Full-bleed by design (no
            max-width cap); vertical rhythm inside a page is flex-col gap-lg. */}
        <main className="flex-1">
          <div className="flex w-full flex-col gap-lg px-xl pb-6xl pt-lg">{children}</div>
        </main>
      </div>
    </LocaleProvider>
  );
}
