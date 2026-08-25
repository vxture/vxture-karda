import { BRAND } from "@karda/shared/brand";
import { t } from "../../../_i18n/catalog";
import { shell } from "../../../_i18n/messages/shell";
import { RebuildClient } from "./rebuild-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export const metadata = {
  title: `${t(shell.subRebuild, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// 加工管道 · 受控重建 (design canvas V2 third row). Demo overlay via
// GET /api/pipeline/rebuild until the 110-processing pipeline lands.
export default function PipelineRebuildPage() {
  return <RebuildClient />;
}
