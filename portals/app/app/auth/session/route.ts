import { userAdmission } from "../../platform/admission";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { resolveSessionUser } from "../lib/session";
import { devLoginEnabled, decodeDevSession, DEV_LOGIN_COOKIE } from "../lib/dev-login";

// GET /auth/session (080-rp section 2.2): read the cookie, resolve the RP session
// (silent-refreshing a near-expiry access token), return the bootstrap claims.
// Never returns tokens to the browser. Anonymous is a 200 with authenticated:false.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const response = await sessionResponse();
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function sessionResponse(): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();

  // Dev virtual login (triple-gated, see auth/lib/dev-login.ts).
  if (devLoginEnabled(cfg.enabled)) {
    const dev = decodeDevSession(jar.get(DEV_LOGIN_COOKIE)?.value);
    if (dev) return NextResponse.json({ authenticated: true, user: dev });
  }

  const rpsid = jar.get(cfg.cookieName)?.value;
  if (!rpsid) return NextResponse.json({ authenticated: false });

  const result = await resolveSessionUser(cfg, rpsid);
  if (!result.available) return NextResponse.json({ error: "session_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } });
  const user = result.user;
  if (!user) return NextResponse.json({ authenticated: false });

  // account_status gate (080-rp section 2.6): non-active is treated as no session.
  if (user.accountStatus && user.accountStatus !== "active") {
    return NextResponse.json({ authenticated: false, reason: "account_inactive" });
  }
  try {
    const admission = await userAdmission(user);
    user.productAccess = admission.productAccess ?? { roles: [], permissions: [] };
    user.canManage = user.productAccess.permissions.includes("product.manage");
    user.isWorkspaceOwner = user.productAccess.roles.includes("owner");
  } catch {
    return NextResponse.json({ error: "authority_unavailable" }, { status: 503 });
  }
  return NextResponse.json({ authenticated: true, user });
}
