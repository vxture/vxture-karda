// S2S token-exchange caller (karda task 2; platform product_210 §3). To call
// Atlas A4, karda needs an aud=atlas RS256 bearer. karda mints it from the
// platform IdP - NOT from Atlas - so this depends only on the platform's token
// endpoint (confirmed implemented) + karda's own confidential client creds, and
// does not wait on Atlas.
//
// §3.2: POST {issuer}/oidc/token, grant_type = token-exchange (RFC 8693), client
// auth = karda's existing OIDC client (client_secret_post, same client as C1),
// aud = the callee product_code (atlas). karda.ask is a service-context act
// (no user access_token in hand at the tool boundary), so it uses the SERVICE
// mode: no subject_token, an explicit requested_context = {org_id, workspace_id}
// the platform validates when minting. Tokens are short-lived (300s, no refresh),
// so they are cached per (org, ws) with a safety margin and re-minted on expiry.
import { getOidcConfig } from "../../auth/lib/config";

export interface AtlasTokenConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  audience: string; // callee product_code, e.g. "atlas"
}

export interface TokenContext {
  org: string;
  ws: string;
}

export interface AtlasTokenSource {
  tokenFor(ctx: TokenContext): Promise<string>;
}

type FetchLike = typeof fetch;

const TOKEN_EXCHANGE_GRANT = "urn:ietf:params:oauth:grant-type:token-exchange";
/** Re-mint this many ms before the token's stated expiry (clock skew + latency). */
const REFRESH_MARGIN_MS = 30_000;

interface Cached {
  token: string;
  expiresAt: number;
}

export class Rfc8693TokenSource implements AtlasTokenSource {
  private cache = new Map<string, Cached>();

  constructor(
    private cfg: AtlasTokenConfig,
    private fetchImpl: FetchLike = fetch,
    private now: () => number = () => Date.now(),
  ) {}

  async tokenFor(ctx: TokenContext): Promise<string> {
    const key = `${ctx.org}|${ctx.ws}`;
    const hit = this.cache.get(key);
    if (hit && this.now() < hit.expiresAt) return hit.token;

    const minted = await this.mint(ctx);
    const ttlMs = Math.max(0, (minted.expiresIn ?? 300) * 1000 - REFRESH_MARGIN_MS);
    this.cache.set(key, { token: minted.accessToken, expiresAt: this.now() + ttlMs });
    return minted.accessToken;
  }

  private async mint(ctx: TokenContext): Promise<{ accessToken: string; expiresIn?: number }> {
    // Service mode (product_210 §3.2): no subject_token; the caller declares the
    // org/ws context and the platform validates it at mint time.
    const body = new URLSearchParams({
      grant_type: TOKEN_EXCHANGE_GRANT,
      audience: this.cfg.audience,
      requested_context: JSON.stringify({ org_id: ctx.org, workspace_id: ctx.ws }),
      client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret,
    });
    const url = `${this.cfg.issuer.replace(/\/$/, "")}/oidc/token`;
    const res = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`token-exchange ${res.status}`);
    const j: unknown = await res.json().catch(() => null);
    const o = (j ?? {}) as Record<string, unknown>;
    if (typeof o.access_token !== "string") throw new Error("token-exchange: no access_token in response");
    return { accessToken: o.access_token, expiresIn: typeof o.expires_in === "number" ? o.expires_in : undefined };
  }
}

/**
 * The Atlas token source, or null when karda has no client credentials to mint
 * with. Reuses the OIDC config (issuer + client id/secret = karda's confidential
 * client, the same one C1 uses); the audience defaults to "atlas".
 */
export function getAtlasTokenSource(): AtlasTokenSource | null {
  const oidc = getOidcConfig();
  if (!oidc.issuer || !oidc.clientId || !oidc.clientSecret) return null;
  return new Rfc8693TokenSource({
    issuer: oidc.issuer,
    clientId: oidc.clientId,
    clientSecret: oidc.clientSecret,
    audience: process.env.ATLAS_AUDIENCE ?? "atlas",
  });
}
