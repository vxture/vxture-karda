// The S2S gateway for the tool surface: verify the token, reject the forbidden
// credential, and produce a CallerContext - shared by the well-known manifest
// route and the tool dispatch route so verification lives in exactly one place.
import { getOidcConfig } from "../../auth/lib/config";
import { verifyToken } from "../../auth/lib/oidc";
import { callerFromClaims, rejectsInternalAuthHeader, type S2sClaims, type CallerContext } from "./s2s";

// The product code is karda; an S2S token to karda must carry aud=karda
// (product_210: single audience, A's token to B is refused).
const PRODUCT_CODE = "karda";

export type GatewayResult =
  | { ok: true; caller: CallerContext }
  | { ok: false; status: number; error: string };

/**
 * Authenticate an S2S request. Order matters: reject the shared-secret header
 * first (a category error, #7), then verify the bearer as an RS256 S2S token
 * with aud=karda, then apply the act.sub / OBO shape rules.
 */
export async function authenticateS2S(req: Request): Promise<GatewayResult> {
  if (rejectsInternalAuthHeader(req.headers)) {
    return { ok: false, status: 401, error: "invalid_token: x-vxture-internal-auth is not a product-to-product credential" };
  }

  const authz = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(authz);
  if (!m) return { ok: false, status: 401, error: "invalid_token: missing bearer" };

  const cfg = getOidcConfig();
  let claims: S2sClaims;
  try {
    // verifyToken enforces RS256 + JWKS + iss + exp; aud pinned to our product.
    claims = (await verifyToken(m[1], cfg, { audience: PRODUCT_CODE })) as unknown as S2sClaims;
  } catch {
    return { ok: false, status: 401, error: "invalid_token: signature/aud/exp check failed" };
  }

  const resolved = callerFromClaims(claims);
  if (!resolved.ok) return { ok: false, status: resolved.status, error: resolved.error };
  return { ok: true, caller: resolved.caller };
}
