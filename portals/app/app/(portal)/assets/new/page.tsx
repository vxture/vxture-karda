import { BRAND } from "@karda/shared/brand";
import { t } from "../../../_i18n/catalog";
import { shell } from "../../../_i18n/messages/shell";
import { NewAssetClient } from "./new-client";

// The title comes from the catalog, resolved at the DEFAULT locale.
//
// `metadata` is produced on the server, which cannot read the locale preference
// (client-side, localStorage), so the title cannot follow a language switch -
// that is TD-014 and needs a cookie-backed server locale. What it CAN do
// already is stop being a second copy of the string: the words live in one
// place, and when a server locale arrives only the second argument changes.
export const metadata = {
  title: `${t(shell.newAsset, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// Creating a library IS the classification step: a document is classified by
// which library it goes into, and each library carries its own sharing grade.
//
// 纯流程页(KD-223,150 §3.1):此前它还同时列库——与 /assets 重复,一份第二个会
// 漂的清单。列表是 /assets 的职责,这里只做一件事:问四个问题,建一个库,把人送
// 进去。
export default function NewAssetPage() {
  return <NewAssetClient />;
}
