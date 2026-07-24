import { NextResponse } from "next/server";
import { KbService } from "../../kb/lib/service";
import { getKbStore } from "../../kb/lib/store";
import { requireAuth, errorJson, readJson } from "../../kb/api/http";

// GET  /api/kb        list the active workspace's libraries
// POST /api/kb        create a U-tier library owned by the caller
//
// Scope is always the session's active workspace - a caller cannot list or
// create in a workspace they are not in, because the workspace comes from the
// verified token, never from the request body.
export const dynamic = "force-dynamic";

function service() {
  return new KbService(getKbStore());
}

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const rows = await service()
    .list(auth.user.activeWorkspace)
    .catch(() => null);
  if (rows === null) return NextResponse.json({ error: "internal" }, { status: 500 });
  return NextResponse.json({ knowledgeBases: rows });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  // The caller creates a user-tier library they own, in their active workspace.
  // owner_type/owner_sub/workspace are set from the session, never the body -
  // a body cannot forge ownership.
  const result = await service().create({
    workspaceId: auth.user.activeWorkspace,
    ownerType: "user",
    ownerSub: auth.user.sub,
    name,
    description: typeof body.description === "string" ? body.description : null,
    processingTemplateId:
      typeof body.processingTemplateId === "string" ? body.processingTemplateId : null,
  });
  if (!result.ok) return errorJson(result.error);
  return NextResponse.json({ knowledgeBase: result.value }, { status: 201 });
}
