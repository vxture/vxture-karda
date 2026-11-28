/**
 * Workforce callback; tenant tokens never create an operations session.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import { NextResponse } from "next/server";
import {operationsConfig as getOidcConfig,operationsReturn} from "../../lib/config";
import {workforce} from "../../lib/identity";
import { exchangeCode, verifyToken } from "../../../auth/lib/oidc";
import { takeAuthState, putSession, type RpSession } from "../../../auth/lib/session-store";
import { sessionCookieOptions } from "../../../auth/lib/cookie";
import { randomToken } from "../../../auth/lib/pkce";

// GET /auth/callback (080-rp section 2.3/2.5): consume the single-use state,
// exchange the code, verify id_token (nonce) + access_token, assert matching
// sub, create the RP session, set the opaque cookie, 302 to returnTo.
export const dynamic = "force-dynamic";

function reject(msg: string): Response {
  // Do not echo untrusted input; a generic 400 avoids oracle/redirect abuse.
  return new NextResponse(`auth callback rejected: ${msg}`, { status: 400 });
}

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  if(!cfg.enabled)return reject("operations not configured");
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) return reject("missing code/state");

  const authState = await takeAuthState(cfg.clientId, state);
  if (!authState) return reject("unknown or replayed state");

  let tokens;
  try {
    tokens = await exchangeCode(cfg, code, authState.verifier);
  } catch {
    return reject("code exchange failed");
  }
  if (!tokens.id_token) return reject("no id_token");

  let idClaims;
  try {
    idClaims = await verifyToken(tokens.id_token, cfg);
  } catch {
    return reject("id_token invalid");
  }
  if (idClaims.nonce !== authState.nonce) return reject("nonce mismatch");

  let accessClaims;
  try {
    accessClaims = await verifyToken(tokens.access_token, cfg);
  } catch {
    return reject("access_token invalid");
  }
  if (typeof idClaims.sub !== "string" || !idClaims.sub || accessClaims.sub !== idClaims.sub) return reject("sub mismatch");
  if (!Number.isSafeInteger(accessClaims.exp) || accessClaims.exp! <= Math.floor(Date.now() / 1000)) return reject("invalid access expiry");
  if (accessClaims.sid !== undefined && accessClaims.sid !== idClaims.sid) return reject("sid mismatch");

  try { workforce(accessClaims); if(!idClaims.sid||!idClaims.exp||idClaims.exp<=Math.floor(Date.now()/1000))throw Error(); }catch{return reject("workforce identity required");}
  const rpsid = randomToken();
  const session: RpSession = {
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    accessExpiresAt: accessClaims.exp!,
    sid: typeof idClaims.sid === "string" ? idClaims.sid : undefined,
    sub: String(idClaims.sub),
  };
  await putSession(cfg.clientId, rpsid, session, cfg.sessionTtlSeconds);

  // returnTo is a whitelisted relative path; anchor it to the app origin.
  const dest = new URL(operationsReturn(authState.returnTo), cfg.appOrigin || url.origin);
  const res = NextResponse.redirect(dest.toString());
  res.cookies.set(cfg.cookieName, rpsid, sessionCookieOptions(cfg));
  return res;
}
