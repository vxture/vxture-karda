import { BRAND } from "@karda/shared/brand";
import { t } from "../_i18n/catalog";
import { shell } from "../_i18n/messages/shell";
import { OverviewClient } from "./overview-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export const metadata = {
  title: `${t(shell.navAssets, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// The product homepage IS the asset overview (owner ruling: 资产为核,首页即
// 知识资产). All data comes from GET /api/overview client-side, gated on the
// session like every console surface.
export default function OverviewPage() {
  return <OverviewClient />;
}
