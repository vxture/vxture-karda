// Verified RFC 8693 adapter. The platform owns org/workspace authorization;
// Atlas receives only a short-lived, scoped service Bearer token.
import { getOidcConfig } from "../../auth/lib/config";
import { PlatformTicketSource, type Verify } from "../../platform/ticket";
export interface AtlasTokenConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}
export interface TokenContext { org: string; ws: string }
export interface AtlasTokenSource { tokenFor(ctx: TokenContext): Promise<string> }
export class Rfc8693TokenSource implements AtlasTokenSource {
  private source: PlatformTicketSource;
  constructor(cfg: AtlasTokenConfig, fetchImpl: typeof fetch = fetch,
    now = Date.now, verify?: Verify) {
    const issuer = cfg.issuer.replace(/\/$/, "");
    this.source = new PlatformTicketSource({ ...getOidcConfig(), ...cfg, issuer,
      tokenUrl: `${issuer}/oidc/token`, jwksUrl: `${issuer}/oidc/jwks` },
    cfg.audience, fetchImpl, verify, () => now() / 1000);
  }
  tokenFor(ctx: TokenContext): Promise<string> {
    return this.source.tokenFor({ orgId: ctx.org, workspaceId: ctx.ws });
  }
}
export function getAtlasTokenSource(): AtlasTokenSource | null {
  const oidc = getOidcConfig();
  if (!oidc.issuer || !oidc.clientId || !oidc.clientSecret) return null;
  return new Rfc8693TokenSource({ ...oidc, audience: process.env.ATLAS_AUDIENCE ?? "atlas" });
}
