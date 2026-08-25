import { BRAND } from "@karda/shared/brand";
import { t } from "../../_i18n/catalog";
import { shell } from "../../_i18n/messages/shell";
import { EvaluationClient } from "./evaluation-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export const metadata = {
  title: `${t(shell.navEvaluation, BRAND.defaultLocale)} - ${BRAND.displayName}`,
};

// The verification & evaluation domain: governance state over the corpus plus
// retrieval/answer quality against a baseline. Data comes from
// GET /api/evaluation client-side, gated on the session; figures are the demo
// overlay (flagged demoOps) until the evaluation runner lands.
export default function EvaluationPage() {
  return <EvaluationClient />;
}
