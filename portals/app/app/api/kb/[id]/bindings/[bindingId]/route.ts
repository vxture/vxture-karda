import { NextResponse } from "next/server";
import { KbService } from "../../../../../kb/lib/service";
import { getKbStore, type KnowledgeBaseRow } from "../../../../../kb/lib/store";
import { BindingService } from "../../../../../kb/connectors/binding-service";
import { getBindingStore } from "../../../../../kb/connectors/binding-store";
import { requireAuth, readJson } from "../../../../../kb/api/http";
import { actorForKb } from "../../../../../kb/api/actor";
import type { AuthUser } from "../../../../../auth/lib/claims";

// GET  /api/kb/:id/bindings/:bindingId          fetch one binding
// POST /api/kb/:id/bindings/:bindingId { action } pause | resume | revoke
//
// Lifecycle changes are owner/admin acts. revoke is terminal (the recall-
// exclusion cascade lands with the connector data-plane). The binding must
// belong to the scoped library, so a binding id from another KB reads not_found.
export const dynamic = "force-dynamic";

function mayManage(user: AuthUser & { activeWorkspace: string }, kb: KnowledgeBaseRow): boolean {
  const actor = actorForKb(user, {
    ownerType: kb.ownerType,
    ownerSub: kb.ownerSub,
    workspaceId: kb.workspaceId,
    publishState: kb.publishState,
  });
  return actor.role === "owner" || actor.role === "ws_admin" || actor.role === "org_admin";
}

async function scoped(id: string, bindingId: string, user: AuthUser & { activeWorkspace: string }) {
  const kbRes = await new KbService(getKbStore()).get(id);
  if (!kbRes.ok || kbRes.value.workspaceId !== user.activeWorkspace) return null;
  const svc = new BindingService(getBindingStore());
  const b = await svc.get(bindingId);
  if (!b.ok || b.value.kbId !== id) return null;
  return { kb: kbRes.value, binding: b.value, svc };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; bindingId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, bindingId } = await ctx.params;
  const s = await scoped(id, bindingId, auth.user);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ binding: s.binding });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string; bindingId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, bindingId } = await ctx.params;
  const s = await scoped(id, bindingId, auth.user);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!mayManage(auth.user, s.kb)) {
    return NextResponse.json({ error: "forbidden", detail: "only an owner or admin may change a binding" }, { status: 403 });
  }

  const body = await readJson(req);
  const action = body.action;
  const run =
    action === "pause" ? s.svc.pause(bindingId)
    : action === "resume" ? s.svc.resume(bindingId)
    : action === "revoke" ? s.svc.revoke(bindingId)
    : null;
  if (!run) {
    return NextResponse.json({ error: "invalid_request", detail: "action must be pause | resume | revoke" }, { status: 400 });
  }

  const result = await run;
  if (!result.ok) {
    const status = result.error.code === "not_found" ? 404 : result.error.code === "illegal_transition" ? 409 : 400;
    return NextResponse.json({ error: result.error.code, detail: result.error }, { status });
  }
  return NextResponse.json({ binding: result.value });
}
