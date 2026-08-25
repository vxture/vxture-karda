import { NextResponse } from "next/server";
import { prismaEnabled } from "../../../../../lib/db";
import { getSet, listQuestions, addQuestion, deleteQuestion } from "../../../../../kb/evaluation/store";
import { requireAuth, readJson } from "../../../../../kb/api/http";

// GET    /api/evaluation/sets/:setId/questions   the set's questions
// POST   /api/evaluation/sets/:setId/questions   add one
// DELETE /api/evaluation/sets/:setId/questions?id=  remove one
//
// EXPECTED EVIDENCE IS AUTHORED AT DOCUMENT LEVEL, never chunk level. A chunk id
// is reborn on every rebuild (110-processing's atomic replace mints new ids), so
// a set pinned to chunks would break on exactly the change it exists to measure.
export const dynamic = "force-dynamic";

async function scoped(setId: string, workspaceId: string) {
  return prismaEnabled() ? getSet(workspaceId, setId) : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ setId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { setId } = await ctx.params;
  if (!(await scoped(setId, auth.user.activeWorkspace))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ questions: await listQuestions(setId) });
}

export async function POST(req: Request, ctx: { params: Promise<{ setId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { setId } = await ctx.params;
  if (!(await scoped(setId, auth.user.activeWorkspace))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await readJson(req);
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "question_required" }, { status: 400 });
  const expectedEvidence = Array.isArray(body.expected_evidence)
    ? body.expected_evidence.filter((x: unknown): x is string => typeof x === "string")
    : [];

  const row = await addQuestion({
    setId,
    question,
    expectedEvidence,
    note: typeof body.note === "string" ? body.note : null,
  });
  return NextResponse.json({ question: row }, { status: 201 });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ setId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { setId } = await ctx.params;
  if (!(await scoped(setId, auth.user.activeWorkspace))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 });
  return (await deleteQuestion(setId, id))
    ? new NextResponse(null, { status: 204 })
    : NextResponse.json({ error: "not_found" }, { status: 404 });
}
