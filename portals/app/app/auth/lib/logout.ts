import type { JWTPayload } from "jose";

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";

/** Used only after RS256, issuer, audience and expiry verification. */
export function logoutSid(claims: JWTPayload): string {
  const events = claims.events;
  if (claims.nonce !== undefined || !events || typeof events !== "object" || Array.isArray(events)) {
    throw new Error("invalid logout events");
  }
  const event = (events as Record<string, unknown>)[BACKCHANNEL_EVENT];
  if (!event || typeof event !== "object" || Array.isArray(event)
    || typeof claims.sid !== "string" || !claims.sid.trim()
    || typeof claims.jti !== "string" || !claims.jti.trim()
    || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
    || claims.exp! <= claims.iat!) throw new Error("invalid logout claims");
  return claims.sid;
}

/** Idempotent deletion must remain retryable; do not claim delivery first. */
export async function revokeLogoutSessions(cid: string, sid: string, store: {
  sessionsForSid(cid: string, sid: string): Promise<string[]>;
  deleteSession(cid: string, rpsid: string): Promise<void>;
}): Promise<void> {
  const sessions = await store.sessionsForSid(cid, sid);
  for (const session of sessions) await store.deleteSession(cid, session);
}

export function endSessionUrl(cfg: { endSessionUrl: string; clientId: string;
  postLogoutRedirectUri: string }, state: string): string {
  const url = new URL(cfg.endSessionUrl);
  url.searchParams.set("client_id", cfg.clientId);
  if (cfg.postLogoutRedirectUri) url.searchParams.set("post_logout_redirect_uri", cfg.postLogoutRedirectUri);
  url.searchParams.set("state", state);
  return url.toString();
}
