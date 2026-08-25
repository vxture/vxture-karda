import { NextResponse } from "next/server";
import { KbService } from "../../../../../../kb/lib/service";
import { getKbStore } from "../../../../../../kb/lib/store";
import { getContentStore } from "../../../../../../kb/lib/content-store";
import { GovernanceService } from "../../../../../../kb/governance/service";
import { requireAuth } from "../../../../../../kb/api/http";
import { mayVerify } from "../../../../../../kb/api/may-verify";

// POST /api/kb/:id/entries/:entryId/verify   mark an entry verified
//
// The document verify route has existed since Track 12; this is its missing
// twin, and it is not symmetry for its own sake. ENTRIES ARE WHAT AGENTS WRITE
// (`kb.create_entry` on the MCP/tool channel), they land unverified, and
// corpus-read counts them in the coverage denominator. Without this route an
// agent-written entry could drag workspace coverage down with no way for a human
// to clear it - so the governance ladder that is supposed to make agent writes
// safe would have had no rung at the top.
//
// Entries are authored in-product, never connector-synced, so the exempt-synced
// refusal cannot arise here; the governance-off refusal still can.
export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; entryId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, entryId } = await ctx.params;

  const kbStore = getKbStore();
  const content = getContentStore();

  const got = await new KbService(kbStore).get(id);
  if (!got.ok || got.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const kb = got.value;

  const entry = await content.getEntry(entryId);
  if (!entry || entry.kbId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  if (!mayVerify(auth.user, kb)) {
    return NextResponse.json(
      { error: "forbidden", detail: "only the assigned verifier or an admin may verify" },
      { status: 403 },
    );
  }

  const r = await new GovernanceService(content, kbStore).verifyEntry(entryId, auth.user.sub, new Date());
  if (!r.ok) {
    const status = r.error.code === "not_found" ? 404 : 409;
    return NextResponse.json({ error: r.error.code }, { status });
  }
  return NextResponse.json({ entry: r.value });
}
