import { NextResponse } from "next/server";
import { KbService } from "../../../../../kb/lib/service";
import { getKbStore, type KnowledgeBaseRow } from "../../../../../kb/lib/store";
import { BindingService } from "../../../../../kb/connectors/binding-service";
import { getBindingStore } from "../../../../../kb/connectors/binding-store";
import { revokeCascade } from "../../../../../kb/connectors/ingest";
import { ContentService } from "../../../../../kb/lib/content-service";
import { getContentStore } from "../../../../../kb/lib/content-store";
import { getObjectStore } from "../../../../../kb/storage/objectstore";
import { getProcessingRuntime } from "../../../../../kb/processing/runtime";
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
  const auth = await requireAuth("data.write");
  if (!auth.ok) return auth.response;
  const { id, bindingId } = await ctx.params;
  const s = await scoped(id, bindingId, auth.user);
  if (!s) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if(!mayManage(auth.user,s.kb))return NextResponse.json({error:"source_denied"},{status:403});
  return NextResponse.json({ binding: s.binding });
}

export async function POST():Promise<Response>{
 const auth=await requireAuth("data.write");if(!auth.ok)return auth.response;
 return NextResponse.json({error:"source_use_management_workflow"},{status:409,headers:{"Cache-Control":"private, no-store"}});
}
