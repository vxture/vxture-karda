import { NextResponse } from "next/server";
import { requireAuth } from "../../../kb/api/http";
import { DEMO_TASKS } from "../../../kb/demo/pipeline-demo";

// GET /api/pipeline/tasks - 任务与队列 read model (demo overlay, demoOps:true,
// same contract as /api/pipeline until 110-processing lands).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  return NextResponse.json(DEMO_TASKS);
}
