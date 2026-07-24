import { NextResponse } from "next/server";
import { KbService } from "../../../../../../kb/lib/service";
import { getKbStore } from "../../../../../../kb/lib/store";
import { ContentService } from "../../../../../../kb/lib/content-service";
import { getContentStore } from "../../../../../../kb/lib/content-store";
import { downloadDocument } from "../../../../../../kb/lib/upload";
import { getObjectStore } from "../../../../../../kb/storage/objectstore";
import { requireAuth } from "../../../../../../kb/api/http";

// GET /api/kb/:id/documents/:docId/download   stream the raw uploaded bytes
//
// karda holds its own copy of the file (self-hosted object storage), so download
// serves from storage_ref, not from any connector. Scoped to the caller's
// workspace like every other document route.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, docId } = await ctx.params;

  const kb = await new KbService(getKbStore()).get(id);
  if (!kb.ok || kb.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const content = new ContentService(getContentStore());
  const doc = await content.getDocument(docId);
  if (!doc.ok || doc.value.kbId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const dl = await downloadDocument(docId, content, getObjectStore());
  if (!dl) return NextResponse.json({ error: "object_missing" }, { status: 404 });

  return new NextResponse(new Uint8Array(dl.bytes), {
    status: 200,
    headers: {
      "content-type": dl.doc.mime ?? "application/octet-stream",
      "content-length": String(dl.bytes.length),
      "content-disposition": `attachment; filename="${encodeURIComponent(dl.doc.title)}"`,
    },
  });
}
