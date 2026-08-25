import { NextResponse } from "next/server";
import { KbService } from "../../../../../kb/lib/service";
import { getKbStore } from "../../../../../kb/lib/store";
import { ContentService } from "../../../../../kb/lib/content-service";
import { getContentStore } from "../../../../../kb/lib/content-store";
import { requireAuth, readJson } from "../../../../../kb/api/http";

// PATCH  /api/kb/:id/folders/:folderId   rename a folder
// DELETE /api/kb/:id/folders/:folderId   remove a folder
//
// Documents filed under it are not orphaned - the DB nulls their folder_id
// (ON DELETE SET NULL), so they become unfiled rather than lost.
export const dynamic = "force-dynamic";

/** Both verbs need the same two-step scope check, and it is the check that
 *  matters: `id` is trusted only after the workspace test, and `folderId` only
 *  after it is shown to belong to THAT library - otherwise a folder id from
 *  another tenant's library would be operated on through our own library's URL. */
async function scoped(id: string, folderId: string, workspaceId: string): Promise<boolean> {
  const kb = await new KbService(getKbStore()).get(id);
  if (!kb.ok || kb.value.workspaceId !== workspaceId) return false;
  const folders = await new ContentService(getContentStore()).listFolders(id);
  return folders.some((f) => f.id === folderId);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; folderId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, folderId } = await ctx.params;
  if (!(await scoped(id, folderId, auth.user.activeWorkspace))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });

  const r = await new ContentService(getContentStore()).renameFolder(id, folderId, name);
  if (!r.ok) {
    return NextResponse.json({ error: r.error.code }, { status: r.error.code === "not_found" ? 404 : 409 });
  }
  return NextResponse.json({ folder: r.value });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; folderId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, folderId } = await ctx.params;

  if (!(await scoped(id, folderId, auth.user.activeWorkspace))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const r = await new ContentService(getContentStore()).deleteFolder(folderId);
  if (!r.ok) return NextResponse.json({ error: r.error.code }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
