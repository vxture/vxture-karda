import { userAdmission } from "../../platform/admission";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { resolveSessionUser } from "../../auth/lib/session";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { hasProductAccess, hasDataAccess, ctaFor } from "../../entitlement/types";

// GET /api/entitlement (C2 verification channel): resolve the current session's
// workspace entitlement and expose the gate outcomes. Read-only; never returns
// the platform secret. Works offline via the Mock resolver.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  let response: Response;
  try { response = await entitlementResponse(); }
  catch { response = NextResponse.json({ error: "platform_unavailable" }, { status: 503 }); }
  response.headers.set("Cache-Control", "no-store");
  return response;
}

async function entitlementResponse(): Promise<Response> {
  const cfg = getOidcConfig();
  const jar = await cookies();
  const rpsid = jar.get(cfg.cookieName)?.value;
  const result = await resolveSessionUser(cfg, rpsid);
  if (!result.available) return NextResponse.json({ error: "session_unavailable" },
    { status: 503, headers: { "Cache-Control": "no-store" } });
  const user = result.user;
  if (!user || !user.activeWorkspace) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const admission = await userAdmission(user);
  if (!admission.entitlement) return NextResponse.json({ error: admission.error }, { status: 403 });
  const entitlement = admission.entitlement;
  return NextResponse.json({
    entitlement,
    gates: {
      productAccess: hasProductAccess(entitlement),
      dataAccess: hasDataAccess(entitlement),
      cta: ctaFor(entitlement),
    },
  });
}
