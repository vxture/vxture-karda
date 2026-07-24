import { NextResponse } from "next/server";
import { KbService } from "../../../../../kb/lib/service";
import { getKbStore } from "../../../../../kb/lib/store";
import { ContentService } from "../../../../../kb/lib/content-service";
import { getContentStore } from "../../../../../kb/lib/content-store";
import { requireAuth } from "../../../../../kb/api/http";
import type { AuthUser } from "../../../../../auth/lib/claims";

// GET    /api/kb/:id/documents/:docId   fetch one document's metadata
// DELETE /api/kb/:id/documents/:docId   soft-delete the document
//
// Both re-check the library is in the caller's workspace and the document is in
// that library, so neither a foreign KB nor a foreign document can be reached by
// id alone.
export const dynamic = "force-dynamic";

function content() {
  return new ContentService(getContentStore());
}

async function scopedDoc(kbId: string, docId: string, user: AuthUser & { activeWorkspace: string }) {
  const kb = await new KbService(getKbStore()).get(kbId);
  if (!kb.ok || kb.value.workspaceId !== user.activeWorkspace) return null;
  const doc = await content().getDocument(docId);
  if (!doc.ok || doc.value.kbId !== kbId) return null;
  return doc.value;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, docId } = await ctx.params;
  const doc = await scopedDoc(id, docId, auth.user);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ document: doc });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, docId } = await ctx.params;
  const doc = await scopedDoc(id, docId, auth.user);
  if (!doc) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const r = await content().transitionDocument(docId, "deleted");
  if (!r.ok) return NextResponse.json({ error: r.error.code, detail: r.error }, { status: 400 });
  return new NextResponse(null, { status: 204 });
}
