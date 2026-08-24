import { BRAND } from "@karda/shared/brand";
import { PipelineClient } from "./pipeline-client";

export const metadata = { title: `加工管道 - ${BRAND.displayName}` };

// The steward-driven processing domain (理解/萃取/编织/验证/入藏), per the
// approved design canvas V2 Steward board. Data comes from GET /api/pipeline
// client-side, gated on the session like every console surface; figures are
// the demo overlay (flagged demoOps) until the 110-processing pipeline lands.
export default function PipelinePage() {
  return <PipelineClient />;
}
