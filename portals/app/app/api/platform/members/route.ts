import { NextResponse } from "next/server";
import { requireAuth } from "../../../kb/api/http";
import { userPlatformContext } from "../../../platform/user-context";
import { authorizedRoster } from "../../../platform/roster";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
    if (!auth.user.canManage) return NextResponse.json({ error: "forbidden" }, { status: 403, headers });
    if (new URL(req.url).search) return NextResponse.json({ error: "context_from_session_only" }, { status: 400, headers });
    return NextResponse.json(await authorizedRoster(await userPlatformContext(auth.user)), { headers });
  } catch { return NextResponse.json({ error: "roster_unavailable" }, { status: 503, headers }); }
}
