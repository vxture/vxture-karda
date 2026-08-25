import { BRAND } from "@karda/shared/brand";
import { t } from "../../../_i18n/catalog";
import { shell } from "../../../_i18n/messages/shell";
import { AssetClient } from "./asset-client";

// The title comes from the catalog, resolved at the DEFAULT locale.
//
// `metadata` is produced on the server, which cannot read the locale preference
// (client-side, localStorage), so the title cannot follow a language switch -
// that is TD-014 and needs a cookie-backed server locale. What it CAN do
// already is stop being a second copy of the string: the words live in one
// place, and when a server locale arrives only the second argument changes.
export const metadata = {
  title: `${t(shell.assetDetail, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// The asset's own workspace - documents, upload, the sharing ladder, the
// governance switch. Moved out of the retired Console (batch 10): the product
// ruled 资产为核、首页即知识资产, and then had no detail view for its primary
// object inside the product shell - the homepage's asset cards could not be
// opened at all. They can now, and they land here.
export default function AssetPage() {
  return <AssetClient />;
}
