import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { deleteSession } from "../lib/session-store";
import { randomToken } from "../lib/pkce";
import { devLoginEnabled, DEV_LOGIN_COOKIE } from "../lib/dev-login";
import { completeLogout } from "../lib/logout-response";

// POST /auth/logout (080-rp section 2.2): destroy the local RP session + clear
// the cookie, then 303 to the IdP end_session endpoint to trigger global logout.
export const dynamic = "force-dynamic";

export async function POST(): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();

  // Dev virtual session (triple-gated): signing out just clears the dev cookie
  // and lands on / - there is no IdP to end-session against.
  if (devLoginEnabled(cfg.enabled) && jar.get(DEV_LOGIN_COOKIE)?.value) {
    const res = NextResponse.redirect(new URL("/", cfg.postLogoutRedirectUri || "http://localhost:3240/"), { status: 303 });
    res.cookies.set(DEV_LOGIN_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const rpsid = jar.get(cfg.cookieName)?.value;
  return completeLogout(cfg, rpsid, { deleteSession, state: () => randomToken(16) });
}
