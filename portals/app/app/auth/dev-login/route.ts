import { NextResponse } from "next/server";
import { getOidcConfig } from "../lib/config";
import { devLoginEnabled, devAuthUser, encodeDevSession, DEV_LOGIN_COOKIE } from "../lib/dev-login";

// GET /auth/dev-login   (dev-only virtual login; 404 unless the triple gate in
// dev-login.ts holds). Sets the dev session cookie and lands in the Console.
//
//   /auth/dev-login                          sign in as the default local owner
//   /auth/dev-login?sub=usr_x&ws=...&org=... custom identity (e.g. a second user
//                                            to try the sharing ladder)
//   /auth/dev-login?clear=1                  sign the dev session out
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  if (!devLoginEnabled(getOidcConfig().enabled)) {
    return new NextResponse("not found", { status: 404 });
  }

  const url = new URL(req.url);
  const returnTo = url.searchParams.get("returnTo") ?? "/console";
  // Same-origin relative paths only - never an open redirect, even in dev.
  const target = returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/console";
  const res = NextResponse.redirect(new URL(target, url.origin));

  if (url.searchParams.get("clear")) {
    res.cookies.set(DEV_LOGIN_COOKIE, "", { path: "/", maxAge: 0 });
    return res;
  }

  const user = devAuthUser({
    sub: url.searchParams.get("sub") ?? undefined,
    org: url.searchParams.get("org") ?? undefined,
    ws: url.searchParams.get("ws") ?? undefined,
  });
  res.cookies.set(DEV_LOGIN_COOKIE, encodeDevSession(user), {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    // no `secure`: local http
  });
  return res;
}
