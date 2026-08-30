import { pageTitle } from "../../../_i18n/server-locale";
import { shell } from "../../../_i18n/messages/shell";
import { AssetClient } from "./asset-client";

// 标题跟随用户语言(TD-014 已闭):pageTitle 读 cookie 里的服务端 locale。
export async function generateMetadata() {
  return pageTitle(shell.assetDetail);
}

// The asset's own workspace - documents, upload, the sharing ladder, the
// governance switch. Moved out of the retired Console (batch 10): the product
// ruled 资产为核、首页即知识资产, and then had no detail view for its primary
// object inside the product shell - the homepage's asset cards could not be
// opened at all. They can now, and they land here.
export default function AssetPage() {
  return <AssetClient />;
}
