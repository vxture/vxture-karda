/**
 * Workforce-only PKCE login.
 * @package @karda/app
 * @layer Application
 * @category ProductOperations
 * @author AI-Generated
 * @date 2026-11-28
 */
import { NextResponse } from "next/server";
import { operationsConfig as getOidcConfig, operationsReturn } from "../../lib/config";
import { makePkce, randomToken } from "../../../auth/lib/pkce";
import { putAuthState } from "../../../auth/lib/session-store";



// GET /auth/login (080-rp section 2.3): mint PKCE(S256) + state + nonce, persist
// the handshake to Redis keyed by state (single-use), and top-level 302 to the
// IdP authorize endpoint. MUST be a top-level navigation - never iframe/XHR.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const url = new URL(req.url);
  const returnTo = operationsReturn(url.searchParams.get("returnTo"));

  if(!cfg.enabled) return NextResponse.json({error:"operations_not_configured"},{status:503});
  const { verifier, challenge } = makePkce();
  const state = randomToken();
  const nonce = randomToken();
  await putAuthState(cfg.clientId, state, { verifier, nonce, returnTo });

  const authorize = new URL(cfg.authorizeUrl);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", cfg.clientId);
  authorize.searchParams.set("redirect_uri", cfg.redirectUri);
  authorize.searchParams.set("scope", cfg.scopes);
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("nonce", nonce);
  authorize.searchParams.set("code_challenge", challenge);
  authorize.searchParams.set("code_challenge_method", "S256");
  return NextResponse.redirect(authorize.toString());
}
