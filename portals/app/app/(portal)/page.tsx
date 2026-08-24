import { BRAND } from "@karda/shared/brand";
import { OverviewClient } from "./overview-client";

export const metadata = { title: `知识资产 - ${BRAND.displayName}` };

// The product homepage IS the asset overview (owner ruling: 资产为核,首页即
// 知识资产). All data comes from GET /api/overview client-side, gated on the
// session like every console surface.
export default function OverviewPage() {
  return <OverviewClient />;
}
