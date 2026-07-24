import { NextResponse } from "next/server";
import { KbService } from "../../../../kb/lib/service";
import { getKbStore } from "../../../../kb/lib/store";
import { requireAuth, errorJson, readJson } from "../../../../kb/api/http";
import { actorForKb } from "../../../../kb/api/actor";
import { PUBLISH_STATES, type PublishState } from "../../../../kb/lib/ownership";

// POST /api/kb/:id/publish   { "target": "private" | "ws_published" | "org_published" }
//
// Publish is a separate endpoint from PATCH because it carries an authorization
// rule PATCH does not - the ladder in ownership.ts. The acting role is resolved
// against THIS library (actorForKb), so the same user is its owner or merely a
// workspace admin depending on whose library it is.
export const dynamic = "force-dynamic";

function service() {
  return new KbService(getKbStore());
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;

  const got = await service().get(id);
  if (!got.ok || got.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const body = await readJson(req);
  const target = body.target;
  if (typeof target !== "string" || !(PUBLISH_STATES as readonly string[]).includes(target)) {
    return NextResponse.json({ error: "invalid_target" }, { status: 400 });
  }

  const actor = actorForKb(auth.user, {
    ownerType: got.value.ownerType,
    ownerSub: got.value.ownerSub,
    workspaceId: got.value.workspaceId,
    publishState: got.value.publishState,
  });
  const result = await service().setPublishState(id, actor, target as PublishState);
  if (!result.ok) return errorJson(result.error);
  return NextResponse.json({ knowledgeBase: result.value });
}
