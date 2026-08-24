"use client";

import type { ReactNode } from "react";
import { FullscreenProvider, ThemeProvider } from "@vxture/design-system";

/**
 * The provider stack, in a client module of our own - correct RSC hygiene:
 * providers belong in a client module. (Historical note: under DS 6.0.0 this
 * was also load-bearing - the published barrel was "use client" + export *,
 * which Next refuses across a server/client boundary. Fixed upstream in 6.1.0,
 * platform#320: the barrel now emits named exports, so the umbrella may be
 * imported from anywhere; this module simply remains the right place for
 * providers.)
 */
// Shell preference baseline (owner, 2026-08-21): theme defaults to LIGHT (not
// system), density and font size stay at DS defaults. The user can change all
// of them from the header's preference panel; ThemeProvider persists choices
// under the DS contract keys (vx-density / vx-fontsize / next-themes theme).
export function Providers({ children }: { children: ReactNode }) {
  // FullscreenProvider backs the header's fullscreen control (ShellFullscreen-
  // Toggle calls useFullscreen, which throws without it). "pseudo" mode is the
  // DS default: the target fills the viewport as a layer rather than taking
  // the browser into real fullscreen, so the shell chrome stays reachable.
  return (
    <ThemeProvider defaultMode="light" defaultDensity="default">
      <FullscreenProvider>{children}</FullscreenProvider>
    </ThemeProvider>
  );
}
