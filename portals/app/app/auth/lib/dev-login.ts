// Dev-only virtual login (local feature browsing). The real auth path is full
// OIDC (JWKS-verified access tokens + a Redis RP session) - unusable on a
// laptop without the platform IdP. This module provides a HARD-GATED substitute
// so the owner can click through the Console locally.
//
// The gate is fail-closed and triple-locked - devLoginEnabled() is true ONLY
// when ALL hold:
//   1. AUTH_DEV_LOGIN=on            (explicit opt-in, never a default)
//   2. the real RP is NOT enabled   (a configured IdP means real login is the
//                                    only acceptable path)
//   3. DEPLOY_STAGE is not production (belt: the prod host sets it)
// When the gate is off, the route 404s and the cookie is dead bytes - there is
// no code path that treats it as identity.
//
// The "session" is a plain base64(JSON AuthUser) cookie: no Redis, no signing.
// That is fine PRECISELY because of the gate: this identity only exists on a
// machine whose operator already controls the process env.
import type { AuthUser } from "./claims";

export const DEV_LOGIN_COOKIE = "vx_dev_session";

/** Stable defaults so locally created data keeps its owner across restarts. */
export const DEV_DEFAULTS = {
  sub: "usr_dev-local-owner",
  org: "00000000-0000-4000-8000-000000000001",
  ws: "00000000-0000-4000-8000-000000000002",
} as const;

export function devLoginEnabled(rpEnabled: boolean): boolean {
  return (
    process.env.AUTH_DEV_LOGIN === "on" &&
    !rpEnabled &&
    process.env.DEPLOY_STAGE !== "production"
  );
}

/** Build the dev AuthUser. Workspace-owner roles so every Console surface
 *  (sharing ladder, governance config, verify) is reachable. */
export function devAuthUser(over: { sub?: string; org?: string; ws?: string } = {}): AuthUser {
  return {
    sub: over.sub || DEV_DEFAULTS.sub,
    activeOrg: over.org || DEV_DEFAULTS.org,
    activeOrgType: "organization",
    activeWorkspace: over.ws || DEV_DEFAULTS.ws,
    roles: ["org:owner", "workspace:owner"],
    accountStatus: "active",
    canManage: true,
    isWorkspaceOwner: true,
  };
}

export function encodeDevSession(user: AuthUser): string {
  return Buffer.from(JSON.stringify(user), "utf-8").toString("base64url");
}

/** Decode the dev cookie; null on any malformed input (treated as anonymous). */
export function decodeDevSession(value: string | undefined): AuthUser | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf-8")) as AuthUser;
    if (typeof parsed.sub !== "string" || !parsed.sub) return null;
    return {
      ...devAuthUser(),
      ...parsed,
      accountStatus: "active",
    };
  } catch {
    return null;
  }
}
