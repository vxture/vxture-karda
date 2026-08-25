import { NextResponse } from "next/server";
// The allow-list and the disposition decision live in kb/lib/preview so the
// VIEWER reads the same one - a viewer that frames a type we send as
// `attachment` shows an empty box, or starts a download nobody asked for.
// (A route module may also only export route handlers, so it could not live
// here even if we wanted it to.)
import { inlineDisposition, inlineContentType } from "../../../../../../kb/lib/preview";
import { KbService } from "../../../../../../kb/lib/service";
import { getKbStore } from "../../../../../../kb/lib/store";
import { ContentService } from "../../../../../../kb/lib/content-service";
import { getContentStore } from "../../../../../../kb/lib/content-store";
import { downloadDocument } from "../../../../../../kb/lib/upload";
import { getObjectStore } from "../../../../../../kb/storage/objectstore";
import { requireAuth } from "../../../../../../kb/api/http";

// GET /api/kb/:id/documents/:docId/download[?inline=1]   stream the raw bytes
//
// karda holds its own copy of the file (self-hosted object storage), so this
// serves from storage_ref, not from any connector. Scoped to the caller's
// workspace like every other document route.
//
// `inline=1` switches the disposition so a browser RENDERS the file instead of
// saving it - that is the whole difference between reading a document and
// downloading it, and until batch 10 the product only offered the second. The
// bytes and the authorization are identical either way; only the header moves.
//
// Inline is allow-listed by media type rather than granted to everything. Two
// reasons, and the second is the serious one: a type the browser cannot render
// inline just downloads anyway, so nothing is gained - and serving arbitrary
// uploaded content inline from our own origin is how stored-XSS happens
// (text/html and SVG are the classic vehicles). Anything not on the list falls
// back to attachment.
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
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

  const wantInline = new URL(req.url).searchParams.get("inline") === "1";
  const disposition = inlineDisposition(dl.doc.mime, wantInline);

  return new NextResponse(new Uint8Array(dl.bytes), {
    status: 200,
    headers: {
      // Inline text needs its charset stated or the browser decodes it with the
      // platform codepage - a Chinese document previews as mojibake while the
      // stored bytes are fine. The download path keeps the mime verbatim.
      "content-type": disposition === "inline" ? inlineContentType(dl.doc.mime) : (dl.doc.mime ?? "application/octet-stream"),
      "content-length": String(dl.bytes.length),
      "content-disposition": `${disposition}; filename="${encodeURIComponent(dl.doc.title)}"`,
      // Belt-and-braces for the inline path: even an allow-listed type must not
      // be re-sniffed into something executable.
      "x-content-type-options": "nosniff",
      "content-security-policy": "sandbox; default-src 'none'",
    },
  });
}
