import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { DEMO_PIPELINE } from "../../kb/demo/pipeline-demo";

// GET /api/pipeline - the 加工管道 read model. The processing pipeline has no
// schema yet (110-processing is designed, unbuilt), so the whole payload is
// the demo overlay and says so via `demoOps: true` - same honesty contract as
// /api/overview's ops figures. When the pipeline lands, task/queue aggregates
// become live reads and the flag drops; the response shape is designed to
// survive that swap unchanged. Gated on the session like every console read.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json(DEMO_PIPELINE);
}
