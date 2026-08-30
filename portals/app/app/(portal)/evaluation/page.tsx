import { pageTitle } from "../../_i18n/server-locale";
import { shell } from "../../_i18n/messages/shell";
import { EvaluationClient } from "./evaluation-client";

// Title from the catalog, resolved at the DEFAULT locale - see the note in
// `(portal)/assets/[kbId]/page.tsx` and TD-014.
export async function generateMetadata() {
  return pageTitle(shell.navEvaluation);
}

// The verification & evaluation domain: governance state over the corpus plus
// retrieval/answer quality against a baseline. Data comes from
// GET /api/evaluation client-side, gated on the session; figures are the demo
// overlay (flagged demoOps) until the evaluation runner lands.
export default function EvaluationPage() {
  return <EvaluationClient />;
}
