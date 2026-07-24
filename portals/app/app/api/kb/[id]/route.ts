import { NextResponse } from "next/server";
import { KbService } from "../../../kb/lib/service";
import { getKbStore } from "../../../kb/lib/store";
import { requireAuth, errorJson, readJson } from "../../../kb/api/http";
import type { KnowledgeBaseRow } from "../../../kb/lib/store";
import type { AuthUser } from "../../../auth/lib/claims";

// GET    /api/kb/:id   fetch one library
// PATCH  /api/kb/:id   rename / reconfigure (NOT publish - see /publish)
// DELETE /api/kb/:id   soft-delete
//
// Every handler re-checks that the library belongs to the caller's active
// workspace. Knowing an id is not authorization: a KB in another workspace must
// read as not_found, never be served or mutated.
export const dynamic = "force-dynamic";

function service() {
  return new KbService(getKbStore());
}

/** Fetch a KB only if it is in the caller's workspace; otherwise not_found. */
async function scoped(
  id: string,
  user: AuthUser & { activeWorkspace: string },
): Promise<KnowledgeBaseRow | null> {
  const r = await service().get(id);
  if (!r.ok) return null;
  return r.value.workspaceId === user.activeWorkspace ? r.value : null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const kb = await scoped(id, auth.user);
  if (!kb) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ knowledgeBase: kb });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const kb = await scoped(id, auth.user);
  if (!kb) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await readJson(req);
  const result = await service().update(id, {
    name: typeof body.name === "string" ? body.name.trim() : undefined,
    description: typeof body.description === "string" ? body.description : undefined,
    processingTemplateId:
      typeof body.processingTemplateId === "string" ? body.processingTemplateId : undefined,
    governanceEnabled:
      typeof body.governanceEnabled === "boolean" ? body.governanceEnabled : undefined,
    exemptSyncedContent:
      typeof body.exemptSyncedContent === "boolean" ? body.exemptSyncedContent : undefined,
  });
  if (!result.ok) return errorJson(result.error);
  return NextResponse.json({ knowledgeBase: result.value });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const kb = await scoped(id, auth.user);
  if (!kb) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const result = await service().remove(id);
  if (!result.ok) return errorJson(result.error);
  return new NextResponse(null, { status: 204 });
}
