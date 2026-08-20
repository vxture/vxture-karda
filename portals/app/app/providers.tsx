"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@vxture/design-system";

/**
 * The provider stack, in a client module of our own - correct RSC hygiene:
 * providers belong in a client module. (Historical note: under DS 6.0.0 this
 * was also load-bearing - the published barrel was "use client" + export *,
 * which Next refuses across a server/client boundary. Fixed upstream in 6.1.0,
 * platform#320: the barrel now emits named exports, so the umbrella may be
 * imported from anywhere; this module simply remains the right place for
 * providers.)
 */
export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
