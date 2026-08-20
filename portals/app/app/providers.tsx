"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@vxture/design-system";

/**
 * The provider stack, in a client module of our own (the same pattern yucer
 * landed on, and correct RSC hygiene regardless): the root layout is a server
 * component, and design-system@6's published barrel is `"use client"` +
 * `export *` - a combination Next refuses to load ACROSS a server/client
 * boundary because it cannot enumerate the exports (platform#320). Imported
 * from inside a client module there is no boundary to cross, so the barrel
 * loads fine.
 *
 * Once platform#320 ships per-module dist output, the restriction "never
 * import the umbrella from a server component" disappears - this module stays
 * anyway, because providers belong in a client module.
 */
export function Providers({ children }: { children: ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
