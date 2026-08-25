import { BRAND } from "@karda/shared/brand";
import { t } from "../../_i18n/catalog";
import { shell } from "../../_i18n/messages/shell";
import { BenchClient } from "./bench-client";

// The title comes from the catalog, resolved at the DEFAULT locale.
//
// `metadata` is produced on the server, which cannot read the locale preference
// (client-side, localStorage), so the title cannot follow a language switch -
// that is TD-014 and needs a cookie-backed server locale. What it CAN do
// already is stop being a second copy of the string: the words live in one
// place, and when a server locale arrives only the second argument changes.
export const metadata = {
  title: `${t(shell.subBench, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// 检验台: ask karda the way an agent does, and read what comes back. It was
// already listed in the portal header's launcher while living outside the
// portal shell - this closes that gap.
export default function BenchPage() {
  return <BenchClient />;
}
