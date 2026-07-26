import type { ReactNode } from "react";
import { BRAND } from "@karda/shared/brand";
import { ConsoleHeader } from "./_components/ConsoleHeader";

export const metadata = {
  title: `Console - ${BRAND.displayName}`,
};

// The Console shell: a persistent header over each library-management page. The
// header is a client component (it reads /auth/session); the layout itself stays
// a server component so it adds no client bundle of its own.
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "#fafafa", minHeight: "100vh" }}>
      <ConsoleHeader brand={BRAND.displayName} />
      {children}
    </div>
  );
}
