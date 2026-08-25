import { NextResponse } from "next/server";
import { KbService } from "../../../../../../kb/lib/service";
import { getKbStore } from "../../../../../../kb/lib/store";
import { BindingService } from "../../../../../../kb/connectors/binding-service";
import { getBindingStore } from "../../../../../../kb/connectors/binding-store";
import { getContentStore } from "../../../../../../kb/lib/content-store";
import { readRevokeImpact } from "../../../../../../kb/connectors/revoke-preview";
import { requireAuth } from "../../../../../../kb/api/http";

// GET /api/kb/:id/bindings/:bindingId/revoke-preview
//
// What revoking would cost, computed BEFORE it happens. `revokeCascade` already
// reports what it did; this is the other half of batch 12's item - a
// confirmation that states the consequence in advance. "Are you sure?" asks a
// question the person cannot answer, because they do not know what is behind
// the button.
//
// A read, so it takes the same scope as GET on the binding rather than the
// owner/admin gate the mutating actions use: seeing what a revoke would cost is
// not itself a privileged act, and a member who can see the binding should be
// able to see its weight.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; bindingId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, bindingId } = await ctx.params;

  const kb = await new KbService(getKbStore()).get(id);
  if (!kb.ok || kb.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const b = await new BindingService(getBindingStore()).get(bindingId);
  if (!b.ok || b.value.kbId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json({ impact: await readRevokeImpact(b.value, getContentStore()) });
}
