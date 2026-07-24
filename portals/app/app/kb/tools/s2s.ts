// S2S caller context for the tool surface (product_210 section 3.4). Verify the
// incoming S2S token and derive the caller tuple (org, ws, act.sub=caller
// product, sub=user?) - every authorization input comes from the verified token,
// never from the request body (discipline #8: header/body org/ws is ignored, the
// token is authority).
//
// The verification itself reuses the OIDC verifyToken (RS256, same JWKS), with
// aud pinned to karda's own product code. What this module adds is the S2S-
// specific claims the tool surface needs and the two refusals the protocol makes
// mandatory: a token with no `act.sub` is a user-level token misused as S2S and
// is rejected (#6), and AUTH_INTERNAL_TOKEN is never accepted as a product-to-
// product credential (#7).
import type { CallMode } from "./catalog";

// The claims an S2S token carries (product_210 section 3.2). act.sub is the RFC
// 8693 actor - the caller product, trusted after signature verification.
export interface S2sClaims {
  iss: string;
  aud: string; // must equal our product code
  act?: { sub?: string }; // caller product_code
  sub?: string; // user id, present in OBO mode
  org_id?: string;
  workspace_id?: string;
  exp: number;
}

export interface CallerContext {
  callerProduct: string; // act.sub
  org: string | null;
  workspace: string | null;
  user: string | null; // sub, present in OBO
  mode: CallMode;
}

export type ResolveResult =
  | { ok: true; caller: CallerContext }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Turn verified S2S claims into a CallerContext, applying the mandatory refusals.
 * The signature/aud/exp/RS256 checks are the verifier's job (done before this);
 * this is the S2S-shape validation the tool surface layers on top.
 */
export function callerFromClaims(claims: S2sClaims): ResolveResult {
  // #6: act.sub must exist. A token with no actor is a user-level access token
  // being misused as a service credential - reject rather than treat the user as
  // the caller product.
  const callerProduct = claims.act?.sub;
  if (!callerProduct) {
    return { ok: false, status: 401, error: "invalid_token: S2S token missing act.sub" };
  }

  // OBO iff a user sub is present; otherwise service mode.
  const mode: CallMode = claims.sub ? "obo" : "service";

  return {
    ok: true,
    caller: {
      callerProduct,
      org: claims.org_id ?? null,
      workspace: claims.workspace_id ?? null,
      user: claims.sub ?? null,
      mode,
    },
  };
}

/**
 * Guard against the shared platform secret being presented as a product-to-
 * product credential (#7). The tool surface is S2S-token only; an
 * x-vxture-internal-auth header here is a category error and is refused.
 */
export function rejectsInternalAuthHeader(headers: { get(name: string): string | null }): boolean {
  return headers.get("x-vxture-internal-auth") !== null;
}
