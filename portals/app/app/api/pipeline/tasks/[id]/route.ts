import { NextResponse } from "next/server";
import { requireAuth } from "../../../../kb/api/http";
import { DEMO_TASK_DETAIL } from "../../../../kb/demo/pipeline-demo";

// GET /api/pipeline/tasks/:id - 任务详情 read model. Demo overlay: the one
// rich demo task is served for any id (echoing the requested id) until the
// pipeline schema lands; demoOps:true says so.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  return NextResponse.json({ ...DEMO_TASK_DETAIL, id });
}
