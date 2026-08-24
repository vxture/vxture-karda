import { BRAND } from "@karda/shared/brand";
import { RebuildClient } from "./rebuild-client";

export const metadata = { title: `受控重建 - ${BRAND.displayName}` };

// 加工管道 · 受控重建 (design canvas V2 third row). Demo overlay via
// GET /api/pipeline/rebuild until the 110-processing pipeline lands.
export default function PipelineRebuildPage() {
  return <RebuildClient />;
}
