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
// So this is a first-class product surface, not a settings form.
export default function NewAssetPage() {
  return <NewAssetClient />;
}
