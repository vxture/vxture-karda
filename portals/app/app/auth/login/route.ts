import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { makePkce, randomToken } from "../lib/pkce";
import { putAuthState } from "../lib/session-store";
import { safeReturnTo } from "../lib/return-to";
import { devLoginEnabled } from "../lib/dev-login";

// GET /auth/login (080-rp section 2.3): mint PKCE(S256) + state + nonce, persist
// the handshake to Redis keyed by state (single-use), and top-level 302 to the
// IdP authorize endpoint. MUST be a top-level navigation - never iframe/XHR.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const url = new URL(req.url);
  const returnTo = safeReturnTo(url.searchParams.get("returnTo"));

  // dev-login 生效时,登录入口移交给它——**/auth/login 是全产品唯一的登录动词**,
  // 前门、内联过期提示、任何未来的入口都指它;真 IdP 没配的本地机上,它以前会把
  // 人 302 到一个不存在的 authorize 端点。移交保 returnTo,回来落原地。
  if (devLoginEnabled(cfg.enabled)) {
    return NextResponse.redirect(new URL(`/auth/dev-login?returnTo=${encodeURIComponent(returnTo)}`, cfg.appOrigin || url.origin));
  }

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
