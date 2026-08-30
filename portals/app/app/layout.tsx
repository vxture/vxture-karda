import type { ReactNode } from "react";
import { Providers } from "./providers";
import { BRAND } from "@karda/shared/brand";
import { serverLocale } from "./_i18n/server-locale";
import "@vxture/design-system/styles/fonts.css";
import "./globals.css";

/**
 * The pre-paint theme script, imported EVALUATION-SAFELY. The /server entry's
 * import chain drags @vxture/design-ui/server -> @phosphor-icons/react, whose
 * module scope calls createContext - fatal in the RSC runtime. Production
 * webpack tree-shakes the unused chain away (verified live), but `next dev`
 * does no DCE and evaluates everything, so a static import 500s every page
 * locally. Dynamic import + catch keeps prod exact and lets dev degrade to a
 * brief theme flash. Upstream ask (platform#320 follow-up): make design-ui's
 * /server entry evaluation-safe, then this collapses back to a static import.
 */
async function themeScript(): Promise<string> {
  try {
    return (await import("@vxture/design-system/server")).themeBootstrapScript;
  } catch {
    return "";
  }
}

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
// First-visit theme default is LIGHT (owner, 2026-08-21), while the DS
// bootstrap falls back to "system" when nothing is persisted. Seeding the
// storage key before the DS script runs makes the very first paint light on a
// dark-OS machine too, without overriding a choice the user has already made.
const lightDefaultScript =
  "try{if(!localStorage.getItem('theme-storage'))localStorage.setItem('theme-storage','light')}catch(e){}";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const bootstrap = await themeScript();
  // TD-014:cookie 让首个字节的 <html lang> 就正确;客户端切换后仍由 Provider 补印。
  const locale = await serverLocale();
  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: lightDefaultScript }} />
        {bootstrap && <script dangerouslySetInnerHTML={{ __html: bootstrap }} />}
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
