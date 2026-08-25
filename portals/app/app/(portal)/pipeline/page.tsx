import { BRAND } from "@karda/shared/brand";
import { t } from "../../_i18n/catalog";
import { shell } from "../../_i18n/messages/shell";
import { PipelineClient } from "./pipeline-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export const metadata = {
  title: `${t(shell.navPipeline, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// The steward-driven processing domain (理解/萃取/编织/验证/入藏), per the
// approved design canvas V2 Steward board. Data comes from GET /api/pipeline
// client-side, gated on the session like every console surface; figures are
// the demo overlay (flagged demoOps) until the 110-processing pipeline lands.
export default function PipelinePage() {
  return <PipelineClient />;
}
