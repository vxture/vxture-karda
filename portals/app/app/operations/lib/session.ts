/**
 * Separate workforce session validation using shared RP storage and central checks.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import type { JWTPayload } from "jose";
import type { OidcConfig } from "../../auth/lib/config";
import { verifyToken, refreshTokens, type TokenSet } from "../../auth/lib/oidc";
import { getSession, rotateSession, withSessionLock, deleteSessionsBySid, type RpSession } from "../../auth/lib/session-store";

import {workforce} from "./identity";
import { checkCentralSession } from "../../auth/lib/central-session";

export interface SessionDeps {
  read: typeof getSession;
  rotate: typeof rotateSession;
  lock: typeof withSessionLock;
  central: typeof checkCentralSession;
  revoke: typeof deleteSessionsBySid;
  verify(token: string, cfg: OidcConfig): Promise<JWTPayload>;
  refresh(cfg: OidcConfig, token: string): Promise<TokenSet>;
  now(): number;
}
const defaults: SessionDeps = { read: getSession, rotate: rotateSession, lock: withSessionLock,
  central: checkCentralSession, revoke: deleteSessionsBySid,
  verify: verifyToken, refresh: refreshTokens, now: () => Math.floor(Date.now() / 1000) };

function validate(claims: JWTPayload, session: RpSession, now: number): JWTPayload & { exp: number } {
  if (claims.sub !== session.sub || !claims.sub
    || !Number.isSafeInteger(claims.exp) || claims.exp! <= now
    || (claims.sid !== undefined && claims.sid !== session.sid)
    || (claims.roles !== undefined && (!Array.isArray(claims.roles)
      || !claims.roles.every(role => typeof role === "string")))
    || [claims.active_org, claims.active_workspace, claims.active_org_type, claims.account_status]
      .some(value => value !== undefined && typeof value !== "string")) {
    throw new Error("session_claims_invalid");
  }
  return claims as unknown as JWTPayload & { exp: number };
}

/** Null means absent/revoked authority. Transport, refresh or validation errors throw. */
export async function getAuthUser(cfg: OidcConfig, rpsid: string,
  deps: SessionDeps = defaults): Promise<string | null> {
  const initial = await deps.read(cfg.clientId, rpsid);
  if (!initial) return null;
  if (initial.accessExpiresAt - deps.now() > 60 && (initial.centralNextCheckAt ?? 0) > deps.now()) {
    const claims = validate(await deps.verify(initial.accessToken, cfg), initial, deps.now());
    const current = await deps.read(cfg.clientId, rpsid);
    if (!current) return null;
    if (current.accessToken === initial.accessToken) return workforce(claims);
  }
  return deps.lock(cfg.clientId, rpsid, async (owner) => {
    // Waiting replicas re-read the winner's result, never reuse a rotating token.
    let session = await deps.read(cfg.clientId, rpsid);
    if (!session) return null;
    const original = session;
    if ((session.centralNextCheckAt ?? 0) <= deps.now()) {
      if (!session.sid) throw new Error("central_sid_required");
      const status = await deps.central(cfg, session.sid);
      if (!status.valid) { await deps.revoke(cfg.clientId, session.sid); return null; }
      session = { ...session, centralNextCheckAt: status.next_check_at };
    }
    if (session.accessExpiresAt - deps.now() <= 60) {
      if (!session.refreshToken) throw new Error("session_refresh_required");
      const tokens = await deps.refresh(cfg, session.refreshToken);
      if (!tokens.access_token || typeof tokens.access_token !== "string"
        || tokens.token_type?.toLowerCase() !== "bearer") throw new Error("session_refresh_invalid");
      const access = validate(await deps.verify(tokens.access_token, cfg), session, deps.now());
      if (tokens.id_token) {
        const id = await deps.verify(tokens.id_token, cfg);
        if (id.sub !== session.sub || (id.sid !== undefined && id.sid !== session.sid)
          || !Number.isSafeInteger(id.exp) || id.exp! <= deps.now()) throw new Error("session_identity_changed");
      }
      if (tokens.refresh_token !== undefined && (typeof tokens.refresh_token !== "string"
        || !tokens.refresh_token)) throw new Error("session_refresh_invalid");
      const next: RpSession = { ...session, accessToken: tokens.access_token,
        idToken: tokens.id_token ?? session.idToken,
        refreshToken: tokens.refresh_token ?? session.refreshToken,
        accessExpiresAt: access.exp };
      session = next;
    }
    const claims = validate(await deps.verify(session.accessToken, cfg), session, deps.now());
    if (session !== original
      && !(await deps.rotate(cfg.clientId, rpsid, original.accessToken, session, owner))) return null;
    const current = await deps.read(cfg.clientId, rpsid);
    if (!current) return null;
    if (current.accessToken !== session.accessToken) throw new Error("session_changed_during_read");
    return workforce(claims);
  });
}

/** Fail closed without converting an outage into an anonymous verdict. */
export async function resolveSessionUser(cfg: OidcConfig, rpsid: string | undefined,
  resolve: typeof getAuthUser = getAuthUser): Promise<
    { available: true; user: string | null } | { available: false; user: null }> {
  if (!rpsid) return { available: true, user: null };
  try { return { available: true, user: await resolve(cfg, rpsid) }; }
  catch { return { available: false, user: null }; }
}

/** Server-only delegated token. The opaque RP handle never comes from a token body field. */
export async function operationsSubjectToken(cfg:OidcConfig,actor:{sub:string;rpsid:string},deps:SessionDeps={...defaults,refresh:async()=>{throw Error('operations_session_renewal_required');}}):Promise<string>{
 const sub=await getAuthUser(cfg,actor.rpsid,deps);if(sub!==actor.sub)throw Error('operations_unauthenticated');const session=await deps.read(cfg.clientId,actor.rpsid);if(!session||session.sub!==sub)throw Error('operations_unauthenticated');const claims=validate(await deps.verify(session.accessToken,cfg),session,deps.now());
 if(workforce(claims)!==sub||claims.aud!==cfg.clientId||typeof claims.scope!=='string'||!claims.scope.split(' ').includes('openid')||typeof claims.sid!=='string'||!claims.sid||typeof claims.jti!=='string'||!claims.jti||!Array.isArray(claims.roles)||claims.roles.some(r=>typeof r!=='string')||['active_org','active_workspace','act','mode'].some(k=>claims[k]!==undefined))throw Error('operations_unauthenticated');
 const current=await deps.read(cfg.clientId,actor.rpsid);if(!current||current.accessToken!==session.accessToken)throw Error('operations_unauthenticated');return session.accessToken;
}
