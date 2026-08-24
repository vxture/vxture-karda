import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { DEMO_EVALUATION } from "../../kb/demo/evaluation-demo";

// GET /api/evaluation - the 验证评测 read model (demo overlay, demoOps:true,
// until the evaluation runner lands).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json(DEMO_EVALUATION);
}
