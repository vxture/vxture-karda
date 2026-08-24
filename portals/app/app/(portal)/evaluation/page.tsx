import { BRAND } from "@karda/shared/brand";
import { EvaluationClient } from "./evaluation-client";

export const metadata = { title: `验证评测 - ${BRAND.displayName}` };

// The verification & evaluation domain: governance state over the corpus plus
// retrieval/answer quality against a baseline. Data comes from
// GET /api/evaluation client-side, gated on the session; figures are the demo
// overlay (flagged demoOps) until the evaluation runner lands.
export default function EvaluationPage() {
  return <EvaluationClient />;
}
