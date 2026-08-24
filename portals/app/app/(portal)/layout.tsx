import type { ReactNode } from "react";
import { LocaleProvider } from "../_shell/locale";
import { PortalShell } from "../_shell/PortalShell";

// The product portal shell (owner 2026-08-24): a 48px 顶栏 over the 工作区,
// which holds three panes - 导航栏 / 内容区 / 值班台 - with the two side panes
// collapsible (PortalShell owns the state). Vocabulary is defined once at the
// top of _shell/NavPane.tsx. The Console (/console) keeps its own management
// shell; contract-facing routes (/status, /api/*) are untouched by this
// group.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <PortalShell>{children}</PortalShell>
    </LocaleProvider>
  );
}
