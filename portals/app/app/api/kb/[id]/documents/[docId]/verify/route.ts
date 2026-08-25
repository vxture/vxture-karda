import { NextResponse } from "next/server";
import { KbService } from "../../../../../../kb/lib/service";
import { getKbStore } from "../../../../../../kb/lib/store";
import { getContentStore } from "../../../../../../kb/lib/content-store";
import { GovernanceService } from "../../../../../../kb/governance/service";
import { requireAuth } from "../../../../../../kb/api/http";
import { mayVerify } from "../../../../../../kb/api/may-verify";

// POST /api/kb/:id/documents/:docId/verify   mark a document verified (Track 12)
//
// Governance is a distinct authority from ownership: the library's assigned
// verifier (default_verifier) may verify, and so may an admin/owner - but a plain
// member cannot, even in their own workspace. The verify itself (clock, exempt /
// governance-off refusals) is the GovernanceService's job; the route resolves the
// actor and maps the outcome to HTTP.
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, docId } = await ctx.params;

  const kbStore = getKbStore();
  const content = getContentStore();

  const got = await new KbService(kbStore).get(id);
  if (!got.ok || got.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const kb = got.value;

  const doc = await content.getDocument(docId);
  if (!doc || doc.kbId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!mayVerify(auth.user, kb)) {
    return NextResponse.json({ error: "forbidden", detail: "only the assigned verifier or an admin may verify" }, { status: 403 });
  }

  const gov = new GovernanceService(content, kbStore);
  const r = await gov.verifyDocument(docId, auth.user.sub, new Date());
  if (!r.ok) {
    // governance_off / governance_exempt are "nothing to verify" states - a 409
    // conflict with the library's configuration, not a bad request.
    const status = r.error.code === "not_found" ? 404 : 409;
    return NextResponse.json({ error: r.error.code }, { status });
  }
  return NextResponse.json({ document: r.value });
}
