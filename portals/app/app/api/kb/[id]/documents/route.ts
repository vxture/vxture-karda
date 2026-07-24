import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore } from "../../../../kb/lib/store";
import { ContentService } from "../../../../kb/lib/content-service";
import { getContentStore } from "../../../../kb/lib/content-store";
import { uploadDocument } from "../../../../kb/lib/upload";
import { getObjectStore } from "../../../../kb/storage/objectstore";
import { requireAuth } from "../../../../kb/api/http";
import type { AuthUser } from "../../../../auth/lib/claims";

// GET  /api/kb/:id/documents   list documents in a library
// POST /api/kb/:id/documents   upload a file into the library (multipart or raw)
//
// The library must be in the caller's active workspace (knowing an id is not
// authorization). Upload stores karda's own copy of the bytes and creates the
// document record; processing to an index happens later via the task worker.
export const dynamic = "force-dynamic";

function content() {
  return new ContentService(getContentStore());
}

async function scopedKb(id: string, user: AuthUser & { activeWorkspace: string }) {
  const r = await new KbService(getKbStore()).get(id);
  if (!r.ok || r.value.workspaceId !== user.activeWorkspace) return null;
  return r.value;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!(await scopedKb(id, auth.user))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ documents: await content().listDocuments(id) });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const kb = await scopedKb(id, auth.user);
  if (!kb) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Accept either multipart/form-data (a real file field) or a raw body with the
  // title/folder in query params - both are used by different clients.
  let bytes: Buffer;
  let title: string;
  let mime: string;
  let folderId: string | null = null;

  const ctype = req.headers.get("content-type") ?? "";
  if (ctype.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof Blob)) return NextResponse.json({ error: "file_required" }, { status: 400 });
    bytes = Buffer.from(await file.arrayBuffer());
    title = typeof form.get("title") === "string" ? (form.get("title") as string) : (file as File).name ?? "untitled";
    mime = file.type || "application/octet-stream";
    const f = form.get("folder_id");
    folderId = typeof f === "string" && f ? f : null;
  } else {
    const url = new URL(req.url);
    bytes = Buffer.from(await req.arrayBuffer());
    title = url.searchParams.get("title") ?? "untitled";
    mime = ctype || "application/octet-stream";
    folderId = url.searchParams.get("folder_id") || null;
  }

  const result = await uploadDocument(
    { kbId: id, workspaceId: auth.user.activeWorkspace, folderId, title, mime, bytes },
    content(),
    getObjectStore(),
  );
  if (!result.ok) {
    const status = result.error.code === "duplicate_document" ? 409 : 400;
    return NextResponse.json({ error: result.error.code }, { status });
  }
  return NextResponse.json({ document: result.value }, { status: 201 });
}
