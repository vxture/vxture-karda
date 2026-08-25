import { BRAND } from "@karda/shared/brand";
import { t } from "../../_i18n/catalog";
import { shell } from "../../_i18n/messages/shell";
import { ChannelsClient } from "./channels-client";

// The title comes from the catalog, resolved at the DEFAULT locale.
//
// `metadata` is produced on the server, which cannot read the locale preference
// (client-side, localStorage), so the title cannot follow a language switch -
// that is TD-014 and needs a cookie-backed server locale. What it CAN do
// already is stop being a second copy of the string: the words live in one
// place, and when a server locale arrives only the second argument changes.
export const metadata = {
  title: `${t(shell.navChannels, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// The supply-channels domain (直供 S2S / Runos MCP), per 230-runos-channel.
// Data comes from GET /api/channels client-side, gated on the session; ops
// figures are the demo overlay (flagged demoOps) until the supply ledger lands.
export default function ChannelsPage() {
  return <ChannelsClient />;
}
