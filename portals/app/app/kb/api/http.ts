// Shared HTTP plumbing for the kb routes: resolve the session once, and map
// service errors to status codes in one place so every route answers
// consistently. A route that hand-rolls its own 401/403/404 is how a surface
// drifts into leaking "not found" where it means "forbidden", or vice versa.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import type { AuthUser } from "../../auth/lib/claims";

export type Authed =
  | { ok: true; user: AuthUser & { activeWorkspace: string } }
  | { ok: false; response: Response };

/**
 * Require a session with an active workspace. Everything in the asset layer is
 * scoped to a workspace, so a session without one cannot be served - and 401
 * (not 403) is right, because the fix is to authenticate/select a workspace, not
 * to gain permission.
 */
export async function requireAuth(): Promise<Authed> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  const user = rpsid ? await getAuthUser(cfg, rpsid).catch(() => null) : null;
  if (!user || !user.activeWorkspace) {
    return { ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  return { ok: true, user: user as AuthUser & { activeWorkspace: string } };
}

/** One place the service error codes become HTTP. */
export function errorStatus(code: string): number {
  switch (code) {
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "name_taken":
    case "folder_name_taken":
    case "duplicate_document":
      return 409;
    case "invalid_ownership_shape":
    case "connector_code_required":
    case "connector_code_not_allowed":
    case "illegal_transition":
    case "missing_required_field":
    case "unknown_field":
      return 400;
    default:
      return 400;
  }
}

export function errorJson(error: { code: string } & Record<string, unknown>): Response {
  return NextResponse.json({ error: error.code, detail: error }, { status: errorStatus(error.code) });
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
