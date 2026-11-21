import { getOidcConfig } from "../lib/config";
import { verifyToken } from "../lib/oidc";
import { deleteSessionsBySid } from "../lib/session-store";
import { logoutSid } from "../lib/logout";

// POST /auth/backchannel-logout (080-rp section 2.7): IdP -> RP server call (no
// browser cookie). Verify logout_token (RS256/iss/aud/exp), require the
// backchannel-logout event + sid, forbid nonce, then idempotently kill sessions.
// A failed deletion returns503 so the same signed delivery can retry safely.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const cfg = getOidcConfig();
  const form = await req.formData().catch(() => null);
  const logoutToken = form?.get("logout_token");
  if (typeof logoutToken !== "string") return new Response("bad request", { status: 400 });

  let sid: string;
  try {
    sid = logoutSid(await verifyToken(logoutToken, cfg));
  } catch {
    return new Response("invalid logout_token", { status: 400 });
  }

  try {
    await deleteSessionsBySid(cfg.clientId, sid);
  } catch {
    return new Response("logout unavailable", { status: 503 });
  }
  return new Response("", { status: 200 });
}
