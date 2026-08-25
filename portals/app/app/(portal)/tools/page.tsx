import { BRAND } from "@karda/shared/brand";
import { t } from "../../_i18n/catalog";
import { shell } from "../../_i18n/messages/shell";
import { ToolsClient } from "./tools-client";

// The title comes from the catalog, resolved at the DEFAULT locale.
//
// `metadata` is produced on the server, which cannot read the locale preference
// (client-side, localStorage), so the title cannot follow a language switch -
// that is TD-014 and needs a cookie-backed server locale. What it CAN do
// already is stop being a second copy of the string: the words live in one
// place, and when a server locale arrives only the second argument changes.
export const metadata = {
  title: `${t(shell.subTools, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// The self-describing tool surface, for an agent developer. Reads
// /api/tools/catalog, which projects the SAME manifest as
// /.well-known/vxture-tools - that one is tailnet-only and S2S-authenticated by
// design, so a browser cannot read it and this page is how a human sees the
// contract at all.
export default function ToolsPage() {
  return <ToolsClient />;
}
