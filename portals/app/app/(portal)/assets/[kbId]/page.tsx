import { BRAND } from "@karda/shared/brand";
import { AssetClient } from "./asset-client";

export const metadata = { title: `资产详情 - ${BRAND.displayName}` };

// The asset's own workspace - documents, upload, the sharing ladder, the
// governance switch. Moved out of the retired Console (batch 10): the product
// ruled 资产为核、首页即知识资产, and then had no detail view for its primary
// object inside the product shell - the homepage's asset cards could not be
// opened at all. They can now, and they land here.
export default function AssetPage() {
  return <AssetClient />;
}
