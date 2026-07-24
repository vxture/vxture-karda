import { NextResponse } from "next/server";
import { manifest } from "../../kb/tools/catalog";
import { authenticateS2S } from "../../kb/tools/gateway";

// GET /.well-known/vxture-tools  (product_210: S2S, tailnet only, NEVER public)
//
// Publishes the karda.* tool descriptors. Unlike the browser-facing
// openid-configuration well-known, this one is S2S-authenticated: a caller must
// present a valid S2S token (aud=karda) to read the manifest. It is served on
// the tailnet face; the public edge does not route here.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const auth = await authenticateS2S(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  return NextResponse.json(manifest());
}
