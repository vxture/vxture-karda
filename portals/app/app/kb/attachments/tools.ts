// Tool backends for the attachment surface (TD-009 9b): create_kb / attach_kb /
// detach_kb. All three are OBO-only (the mode gate refuses a service call before
// dispatch reaches here), so every call carries a real user - the attachment is
// keyed to (workspace, user, product), where product is the CALLING product
// (act.sub), not karda.
import type { DispatchResult } from "../tools/dispatch";
import type { CallerContext } from "../tools/s2s";
import type { KbService } from "../lib/service";
import type { AttachmentStore } from "./store";

export interface AttachmentToolDeps {
  kb: KbService;
  attachments: AttachmentStore;
}

const bad = (detail: string): DispatchResult => ({ status: 400, body: { error: "invalid_request", detail } });
const notFound = (): DispatchResult => ({ status: 404, body: { error: "not_found", detail: "library not found in this workspace" } });

/** ws + user + calling product, asserted present (dispatch guarantees OBO + ws). */
function principal(caller: CallerContext): { ws: string; user: string; product: string } | null {
  if (!caller.workspace || !caller.user) return null;
  return { ws: caller.workspace, user: caller.user, product: caller.callerProduct };
}

/**
 * create_kb: create a user-tier library the caller owns, auto-attached at the
 * creation site (definition 4.8). Ownership is set from the token, never the args.
 */
export async function createKb(caller: CallerContext, args: Record<string, unknown>, deps: AttachmentToolDeps): Promise<DispatchResult> {
  const who = principal(caller);
  if (!who) return bad("token carries no workspace or user");

  const name = typeof args.name === "string" ? args.name.trim() : "";
  if (!name) return bad("name is required");

  const created = await deps.kb.create({ workspaceId: who.ws, ownerType: "user", ownerSub: who.user, name });
  if (!created.ok) {
    if (created.error.code === "name_taken") return { status: 409, body: { error: "name_taken" } };
    return bad(created.error.code);
  }
  // Auto-attach at the creation site - the creator owns it and works with it.
  await deps.attachments.attach({ workspaceId: who.ws, userSub: who.user, productCode: who.product, kbId: created.value.id });
  return { status: 201, body: { knowledge_base: { id: created.value.id, name: created.value.name }, attached: true } };
}

/**
 * attach_kb: add a VISIBLE library to the caller's attachment list. Visible means
 * in the caller's workspace AND either owned by them or published to the workspace
 * / org - knowing an id is not permission, so a private library owned by someone
 * else reads not_found.
 */
export async function attachKb(caller: CallerContext, args: Record<string, unknown>, deps: AttachmentToolDeps): Promise<DispatchResult> {
  const who = principal(caller);
  if (!who) return bad("token carries no workspace or user");
  const kbId = typeof args.kb_id === "string" ? args.kb_id : "";
  if (!kbId) return bad("kb_id is required");

  const got = await deps.kb.get(kbId);
  if (!got.ok || got.value.workspaceId !== who.ws) return notFound();
  const kb = got.value;
  const visible = kb.ownerSub === who.user || kb.publishState === "ws_published" || kb.publishState === "org_published";
  if (!visible) return notFound();

  await deps.attachments.attach({ workspaceId: who.ws, userSub: who.user, productCode: who.product, kbId });
  return { status: 200, body: { kb_id: kbId, attached: true } };
}

/**
 * detach_kb: remove a library from the caller's attachment list. Idempotent and
 * scoped by the attachment key, so it needs no visibility check - detaching
 * something not attached simply reports attached:false.
 */
export async function detachKb(caller: CallerContext, args: Record<string, unknown>, deps: AttachmentToolDeps): Promise<DispatchResult> {
  const who = principal(caller);
  if (!who) return bad("token carries no workspace or user");
  const kbId = typeof args.kb_id === "string" ? args.kb_id : "";
  if (!kbId) return bad("kb_id is required");

  // `attached` reports the STATE after the call, which is always false; `removed`
  // says whether a row was actually taken out (false on an idempotent re-detach).
  const removed = await deps.attachments.detach({ workspaceId: who.ws, userSub: who.user, productCode: who.product, kbId });
  return { status: 200, body: { kb_id: kbId, attached: false, removed } };
}
