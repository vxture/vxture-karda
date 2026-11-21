import type { JWTPayload } from "jose";
import { getOidcConfig, type OidcConfig } from "../auth/lib/config";
import { verifyToken } from "../auth/lib/oidc";
import { assertInternalTarget } from "../lib/internal-target";

export interface PlatformContext {
  orgId: string;
  workspaceId: string;
  subject?: string;
  subjectToken?: string;
}

export function validateServiceClaims(claims: JWTPayload, context: PlatformContext,
  audience: string, now = Date.now() / 1000): void {
  const actor = claims.act as Record<string, unknown> | undefined;
  if (!context.orgId || !context.workspaceId || claims.aud !== audience || actor?.sub !== "karda"
    || claims.scope !== `tool:${audience}` || claims.delegated !== undefined
    || claims.org_id !== context.orgId || claims.workspace_id !== context.workspaceId
    || claims.mode !== (context.subjectToken ? "obo" : "service")
    || (context.subjectToken ? !context.subject || claims.sub !== context.subject : claims.sub !== undefined)
    || !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp)
    || claims.iat! > now + 30 || claims.exp! <= now || claims.exp! <= claims.iat!
    || claims.exp! - claims.iat! > 300) throw new Error("service_ticket_scope_invalid");
}

export type Verify = (token: string, cfg: OidcConfig, audience: string) => Promise<JWTPayload>;
export class PlatformTicketSource {
  private cache = new Map<string, { token: string; expiresAt: number }>();
  private pending = new Map<string, Promise<string>>();
  constructor(private cfg: OidcConfig, private audience = "vxture",
    private fetcher: typeof fetch = fetch,
    private verify: Verify = (token, cfg, audience) => verifyToken(token, cfg, { audience }),
    private now = () => Date.now() / 1000) {}

  async tokenFor(context: PlatformContext): Promise<string> {
    if (!context.orgId || !context.workspaceId || Boolean(context.subject) !== Boolean(context.subjectToken)) {
      throw new Error("service_context_required");
    }
    // User tickets are never reused across admission checks. Service credentials
    // are cached only to their verified signed expiry, with bounded storage.
    if (context.subjectToken) return this.mint(context);
    const key = JSON.stringify([context.orgId, context.workspaceId]);
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now() + 30) return hit.token;
    const pending = this.pending.get(key);
    if (pending) return pending;
    const work = this.mint(context, key).finally(() => this.pending.delete(key));
    this.pending.set(key, work);
    return work;
  }

  private async mint(context: PlatformContext, key?: string): Promise<string> {
    const body = new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      audience: this.audience, requested_token_type: "urn:ietf:params:oauth:token-type:access_token" });
    if (context.subjectToken) {
      body.set("subject_token", context.subjectToken);
      body.set("subject_token_type", "urn:ietf:params:oauth:token-type:access_token");
    } else {
      body.set("org_id", context.orgId); body.set("workspace_id", context.workspaceId);
    }
    const credentials = `${encodeURIComponent(this.cfg.clientId)}:${encodeURIComponent(this.cfg.clientSecret)}`;
    const response = await this.fetcher(assertInternalTarget(this.cfg.tokenUrl), {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Basic ${Buffer.from(credentials).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: body.toString(),
    });
    if (!response.ok) throw new Error(`service_exchange_${response.status}`);
    const value = await response.json() as Record<string, unknown> | null;
    if (value?.token_type !== "Bearer" || typeof value.access_token !== "string" || !value.access_token) {
      throw new Error("service_ticket_invalid");
    }
    const claims = await this.verify(value.access_token, this.cfg, this.audience);
    validateServiceClaims(claims, context, this.audience, this.now());
    if (key) {
      if (this.cache.size >= 1000) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, { token: value.access_token, expiresAt: claims.exp! });
    }
    return value.access_token;
  }
}

const sources = new Map<string, { cfg: string; source: PlatformTicketSource }>();
export function getPlatformTicketSource(audience = "vxture"): PlatformTicketSource {
  const cfg = getOidcConfig();
  if (!cfg.clientId || !cfg.clientSecret) throw new Error("service_identity_unconfigured");
  const identity = JSON.stringify([cfg.issuer, cfg.tokenUrl, cfg.clientId, cfg.clientSecret]);
  const current = sources.get(audience);
  if (current?.cfg === identity) return current.source;
  const source = new PlatformTicketSource(cfg, audience);
  sources.set(audience, { cfg: identity, source });
  return source;
}
