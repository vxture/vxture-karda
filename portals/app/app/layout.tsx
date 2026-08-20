import type { ReactNode } from "react";
import { themeBootstrapScript } from "@vxture/design-system/server";
import { Providers } from "./providers";
import { BRAND } from "@karda/shared/brand";
import "@vxture/design-system/styles/fonts.css";
import "./globals.css";

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
};

// Root layout wired to the design system (KD-020): DS globals + the vxture
// brand entry (globals.css), DS fonts, the client provider stack
// (providers.tsx), and the pre-paint theme bootstrap - since DS 6.1.0 the
// script is exported from the server-safe /server entry (platform#320), so the
// server layout can mount it in <head> and the first paint carries the right
// theme (no flash). suppressHydrationWarning stays: ThemeProvider still stamps
// <html> client-side, so that one attribute legitimately differs.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
