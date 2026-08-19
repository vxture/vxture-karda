import type { ReactNode } from "react";
import { ThemeProvider, themeBootstrapScript } from "@vxture/design-system";
import { BRAND } from "@karda/shared/brand";
import "@vxture/design-system/styles/fonts.css";
import "./globals.css";

export const metadata = {
  title: BRAND.displayName,
  description: `${BRAND.displayName} - a Vxture product`,
};

// Root layout wired to the design system (KD-020): DS globals + the vxture
// brand entry (globals.css), DS fonts, and the ThemeProvider with the
// pre-hydration bootstrap script so the theme applies before first paint
// (suppressHydrationWarning is the documented pairing for that script).
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={BRAND.defaultLocale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
