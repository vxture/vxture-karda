import { cookies } from "next/headers";
import { getOidcConfig } from "../auth/lib/config";
import { getSession } from "../auth/lib/session-store";
import { verifyToken } from "../auth/lib/oidc";
import type { AuthUser } from "../auth/lib/claims";
import type { PlatformContext } from "./ticket";

/** Bridge an already-resolved RP user into a verified, server-only OBO context. */
export async function userPlatformContext(user: AuthUser): Promise<PlatformContext> {
  const cfg = getOidcConfig();
  const id = (await cookies()).get(cfg.cookieName)?.value;
  if (!id || !user.activeOrg || !user.activeWorkspace) throw new Error("user_context_required");
  const session = await getSession(cfg.clientId, id);
  if (!session) throw new Error("user_session_ended");
  const claims = await verifyToken(session.accessToken, cfg);
  if (claims.sub !== user.sub || claims.active_org !== user.activeOrg
    || claims.active_workspace !== user.activeWorkspace
    || typeof claims.exp !== "number" || claims.exp <= Date.now() / 1000) throw new Error("user_context_changed");
  return { orgId: user.activeOrg, workspaceId: user.activeWorkspace,
    subject: user.sub, subjectToken: session.accessToken };
}
