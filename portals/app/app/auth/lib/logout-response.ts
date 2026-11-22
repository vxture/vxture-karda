import { NextResponse } from "next/server";
import type { OidcConfig } from "./config";
import { clearCookieOptions } from "./cookie";
import { endSessionUrl } from "./logout";

export async function completeLogout(cfg: OidcConfig, rpsid: string | undefined, deps: {
  deleteSession(clientId: string, rpsid: string): Promise<void>;
  state(): string;
}): Promise<Response> {
  if (rpsid) {
    try { await deps.deleteSession(cfg.clientId, rpsid); }
    catch { return NextResponse.json({ error: "session_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }); }
  }
  // A form POST must become GET at Accounts; 307 would replay the form there.
  const res = NextResponse.redirect(endSessionUrl(cfg, deps.state()), { status: 303 });
  res.cookies.set(cfg.cookieName, "", clearCookieOptions(cfg));
  res.headers.set("Cache-Control", "no-store");
  return res;
}
