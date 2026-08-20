import type { ReactNode } from "react";
import { Providers } from "./providers";
import { BRAND } from "@karda/shared/brand";
import "@vxture/design-system/styles/fonts.css";
import "./globals.css";

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
};

// Root layout wired to the design system (KD-020): DS globals + the vxture
// brand entry (globals.css), DS fonts, and the client provider stack
// (providers.tsx - the umbrella must not be imported from a server component
// until platform#320 fixes the published barrel).
//
// suppressHydrationWarning is required, not cosmetic: ThemeProvider resolves
// the theme client-side and stamps <html>, so server markup and the first
// client render legitimately differ on that attribute. The pre-paint
// themeBootstrapScript is NOT mounted yet - it is only exported through the
// broken client barrel; platform#320 asks for a server-safe export, and until
// then a brief first-paint theme flash is the accepted cost (same call yucer
// made).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
