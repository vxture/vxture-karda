import type { ReactNode } from "react";
import { LocaleProvider } from "../_shell/locale";
import { PortalShell } from "../_shell/PortalShell";

// The product portal shell, V3 指挥台 (owner 2026-08-24): 48px header over
// three panes - nav-rail cards / content / steward duty desk - both rails
// collapsible (PortalShell owns the state). The Console (/console) keeps its
// own management shell; contract-facing routes (/status, /api/*) are
// untouched by this group.
export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <PortalShell>{children}</PortalShell>
    </LocaleProvider>
  );
}
