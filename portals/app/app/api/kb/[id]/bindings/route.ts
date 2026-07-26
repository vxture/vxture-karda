import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore, type KnowledgeBaseRow } from "../../../../kb/lib/store";
import { BindingService } from "../../../../kb/connectors/binding-service";
import { getBindingStore } from "../../../../kb/connectors/binding-store";
import { connectorByCode, degradations } from "../../../../kb/connectors/catalog";
import { requireAuth, readJson } from "../../../../kb/api/http";
import { actorForKb } from "../../../../kb/api/actor";
import type { AuthUser } from "../../../../auth/lib/claims";

// GET  /api/kb/:id/bindings   list the library's external-source bindings
// POST /api/kb/:id/bindings   bind a source (owner/admin, OBO)
//
// Binding a source is an owner act (220-connector-framework section 9): the
// route resolves the actor against THIS library and only an owner/admin may
// create, while any workspace member scoped to the library may list.
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

async function scopedKb(id: string, user: AuthUser & { activeWorkspace: string }): Promise<KnowledgeBaseRow | null> {
  const r = await new KbService(getKbStore()).get(id);
  return r.ok && r.value.workspaceId === user.activeWorkspace ? r.value : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  if (!(await scopedKb(id, auth.user))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const bindings = await new BindingService(getBindingStore()).listForKb(id);
  return NextResponse.json({ bindings });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const kb = await scopedKb(id, auth.user);
  if (!kb) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!mayManage(auth.user, kb)) {
    return NextResponse.json({ error: "forbidden", detail: "only an owner or admin may bind a source" }, { status: 403 });
  }

  const body = await readJson(req);
  const connectorCode = typeof body.connector_code === "string" ? body.connector_code : "";
  const externalSourceId = typeof body.external_source_id === "string" ? body.external_source_id : "";
  if (!connectorCode || !externalSourceId) {
    return NextResponse.json({ error: "invalid_request", detail: "connector_code and external_source_id are required" }, { status: 400 });
  }

  const result = await new BindingService(getBindingStore()).create({
    kbId: id,
    connectorCode,
    externalSourceId,
    createdBy: auth.user.sub,
  });
  if (!result.ok) {
    const status = result.error.code === "binding_exists" ? 409 : 400;
    return NextResponse.json({ error: result.error.code }, { status });
  }

  // Surface the connector's accepted trade-offs so the owner sees them at bind
  // time (section 4 / section 8 - degradation must be explicit, not silent).
  const connector = connectorByCode(connectorCode);
  return NextResponse.json(
    { binding: result.value, connector: connector && { name: connector.name, capabilities: connector.capabilities, degradations: degradations(connector.capabilities) } },
    { status: 201 },
  );
}
