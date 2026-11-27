import { NextResponse } from "next/server";
import { requireAuth } from "../../../../kb/api/http";
import { DEMO_TASK_DETAIL } from "../../../../kb/demo/pipeline-demo";
import { getPrismaClient, prismaEnabled } from "../../../../lib/db";
import { taskDetail } from "../../../../kb/processing/task-detail";

// Production detail is scoped to the authenticated workspace and full task id.
// The authored overlay is available only in the offline, no-database mode.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireAuth("data.read");
  if (!auth.ok) return auth.response;
  const { id } = await params;
  if (!prismaEnabled()) return NextResponse.json({ ...DEMO_TASK_DETAIL, id });
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const p = await getPrismaClient();
  const row = await p.processingTask.findFirst({
    where: { id, knowledgeBase: { workspaceId: auth.user.activeWorkspace, deletedAt: null } },
    include: { document: { select: { title: true } }, knowledgeBase: { select: { name: true } }, stages: true },
  });
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({...taskDetail({ ...row, kbName: row.knowledgeBase.name,
    documentTitle: row.document.title ?? "", stages: row.stages }),navigation:{kbId:row.kbId,documentId:row.documentId,state:row.state,reason:row.failureReason}}, { headers: { "Cache-Control": "no-store" } });
}
