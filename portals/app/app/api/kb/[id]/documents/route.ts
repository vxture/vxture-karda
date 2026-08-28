import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore } from "../../../../kb/lib/store";
import { ContentService } from "../../../../kb/lib/content-service";
import { getContentStore } from "../../../../kb/lib/content-store";
import { uploadDocument } from "../../../../kb/lib/upload";
import { getObjectStore } from "../../../../kb/storage/objectstore";
import { getProcessingRuntime, enqueueForDocument } from "../../../../kb/processing/runtime";
import { requireAuth } from "../../../../kb/api/http";
import { readParkedByDocument } from "../../../../kb/processing/task-read";
import { prismaEnabled } from "../../../../lib/db";
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
  // `parked` 与 `documents` 并列,不合进文档行:文档没有驻留,是它的任务驻留了
  // (`readParkedByDocument` 的注释写了为什么不去撑宽 `DocumentRow`)。
  //
  // 没有数据库时它是空对象而不是缺字段——界面永远拿到一个可索引的东西,不必为
  // 「离线」再写一条分支。
  const [documents, parked] = await Promise.all([
    content().listDocuments(id),
    prismaEnabled() ? readParkedByDocument(id) : Promise.resolve({}),
  ]);
  return NextResponse.json({ documents, parked });
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

  // On a successful upload, enqueue the document for processing on the shared
  // runtime queue. A tick (POST /api/kb/processing/tick) drains it later; the
  // document stays `processing` until it indexes or parks at embed (Atlas A1).
  const runtime = getProcessingRuntime();
  const result = await uploadDocument(
    {
      kbId: id,
      workspaceId: auth.user.activeWorkspace,
      folderId,
      title,
      mime,
      bytes,
      // Provenance: a Console upload is karda's own surface acting for the
      // session user.
      createdInProduct: "karda",
      createdBy: auth.user.sub,
    },
    content(),
    getObjectStore(),
    (doc) => {
      enqueueForDocument(runtime.queue, {
        docId: doc.id,
        kbId: kb.id,
        workspaceId: kb.workspaceId,
        contentHash: doc.contentHash,
        config: {
          processingTemplateId: kb.processingTemplateId,
          processingParams: {},
          embeddingModel: null,
        },
        trigger: "upload",
      });
    },
  );
  if (!result.ok) {
    const status = result.error.code === "duplicate_document" ? 409 : 400;
    return NextResponse.json({ error: result.error.code }, { status });
  }
  return NextResponse.json({ document: result.value }, { status: 201 });
}
