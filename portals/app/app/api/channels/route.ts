import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { DEMO_CHANNELS } from "../../kb/demo/channels-demo";

// GET /api/channels - the 供给通道 read model (demo overlay, demoOps:true,
// until the supply ledger lands with the channels milestone).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json(DEMO_CHANNELS);
}
