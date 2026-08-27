import { BRAND } from "@karda/shared/brand";
import { t } from "../../_i18n/catalog";
import { shell } from "../../_i18n/messages/shell";
import { AssetsClient } from "./assets-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export const metadata = {
  title: `${t(shell.navAssets, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// The 知识资产 domain overview. It USED to be the product homepage (owner ruling
// 「资产为核,首页即知识资产」); that ruling was amended on 2026-08-27 - see
// KD-214 and 150-page-architecture section 2. The重心 is still assets; what
// changed is that the FIRST SCREEN now has to answer "can this be used at all",
// which is not an asset question, and pinning both jobs to one route left the
// second one with nowhere to be said.
//
// All data comes from GET /api/overview client-side, gated on the session like
// every console surface.
export default function AssetsPage() {
  return <AssetsClient />;
}
