import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore } from "../../../../kb/lib/store";
import { ContentService } from "../../../../kb/lib/content-service";
import { getContentStore } from "../../../../kb/lib/content-store";
import { requireAuth, readJson } from "../../../../kb/api/http";
import type { AuthUser } from "../../../../auth/lib/claims";

// GET  /api/kb/:id/folders   list the library's folders (the directory structure)
// POST /api/kb/:id/folders   create a folder
//
// Folders are the in-library directory structure - single level, organisation
// only, no permission semantics (permission is library-level). Scoped to the
// caller's workspace.
export const dynamic = "force-dynamic";

function content() {
  return new ContentService(getContentStore());
}

async function scopedKb(id: string, user: AuthUser & { activeWorkspace: string }) {
  const r = await new KbService(getKbStore()).get(id);
  return r.ok && r.value.workspaceId === user.activeWorkspace ? r.value : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!(await scopedKb(id, auth.user))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ folders: await content().listFolders(id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!(await scopedKb(id, auth.user))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const r = await content().createFolder(id, name);
  if (!r.ok) return NextResponse.json({ error: r.error.code }, { status: 409 });
  return NextResponse.json({ folder: r.value }, { status: 201 });
}
