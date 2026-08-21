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
        <main className="flex-1">{children}</main>
      </div>
    </LocaleProvider>
  );
}
