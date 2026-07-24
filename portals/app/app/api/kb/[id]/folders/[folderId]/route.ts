import { NextResponse } from "next/server";
import { KbService } from "../../../../../kb/lib/service";
import { getKbStore } from "../../../../../kb/lib/store";
import { ContentService } from "../../../../../kb/lib/content-service";
import { getContentStore } from "../../../../../kb/lib/content-store";
import { requireAuth } from "../../../../../kb/api/http";

// DELETE /api/kb/:id/folders/:folderId   remove a folder
//
// Documents filed under it are not orphaned - the DB nulls their folder_id
// (ON DELETE SET NULL), so they become unfiled rather than lost.
export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; folderId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, folderId } = await ctx.params;

  const kb = await new KbService(getKbStore()).get(id);
  if (!kb.ok || kb.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const content = new ContentService(getContentStore());
  // confirm the folder belongs to this KB before deleting
  const folders = await content.listFolders(id);
  if (!folders.some((f) => f.id === folderId)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const r = await content.deleteFolder(folderId);
  if (!r.ok) return NextResponse.json({ error: r.error.code }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
