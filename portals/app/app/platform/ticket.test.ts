import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, SignJWT, type JWTPayload } from "jose";
import { PlatformTicketSource, validateServiceClaims } from "./ticket";
import { getOidcConfig } from "../auth/lib/config";
import { verifyToken } from "../auth/lib/oidc";
import { parseProductAccess } from "./access";
const context = { orgId: "o", workspaceId: "w" };
const claims: JWTPayload = { aud: "vxture", act: { sub: "karda" }, org_id: "o", workspace_id: "w",
  mode: "service", scope: "tool:vxture", iat: 1000, exp: 1300 };
test("service tickets reject confused audience, actor, mode and tenant", () => {
  validateServiceClaims(claims, context, "vxture", 1100);
  for (const change of [{ aud: "atlas" }, { act: { sub: "karda-beta" } }, { org_id: "other" },
    { workspace_id: "other" }, { scope: "tool:atlas" }, { delegated: true }, { delegated: false },
    { mode: "obo" }, { sub: "usr" }, { iat: 1101 }, { exp: 1400 }, { exp: 1100 }, { iat: 1000.5 }]) {
    // The future iat case must exceed clock tolerance.
    const altered = change.iat === 1101 ? { iat: 1131 } : change;
    assert.throws(() => validateServiceClaims({ ...claims, ...altered }, context, "vxture", 1100));
  }
  const obo = { ...context, subject: "usr", subjectToken: "private-access-token" };
  validateServiceClaims({ ...claims, mode: "obo", sub: "usr" }, obo, "vxture", 1100);
  assert.throws(() => validateServiceClaims({ ...claims, mode: "obo", sub: "other" }, obo, "vxture", 1100));
});
test("exchange validates an actual signed JWT and rejects wrong signing key", async () => {
  const keys = await generateKeyPair("RS256");
  const wrong = await generateKeyPair("RS256");
  const cfg = { ...getOidcConfig(), issuer: "https://accounts.example.test", clientId: "karda-beta", clientSecret: "local-test-only",
    tokenUrl: "https://accounts.example.test/oidc/token" };
  const now = Math.floor(Date.now() / 1000);
  const signed = await new SignJWT({ ...claims, iat: now, exp: now + 120 })
    .setProtectedHeader({ alg: "RS256" }).setIssuer(cfg.issuer).sign(keys.privateKey);
  let sent: RequestInit | undefined;
  const fetcher = (async (_url, init) => { sent = init;
    return Response.json({ token_type: "Bearer", access_token: signed }); }) as typeof fetch;
  const verifier = (token: string, config: typeof cfg, audience: string) => verifyToken(token, config, { audience, keyResolver: keys.publicKey });
  assert.equal(await new PlatformTicketSource(cfg, "vxture", fetcher, verifier).tokenFor(context), signed);
  const form = new URLSearchParams(String(sent!.body));
  assert.equal(form.get("client_secret"), null);
  assert.equal(form.get("client_id"), null);
  assert.equal(form.get("requested_token_type"), "urn:ietf:params:oauth:token-type:access_token");
  assert.equal(sent!.redirect, "error");
  assert.ok(sent!.signal);
  const badVerifier = (token: string, config: typeof cfg, audience: string) => verifyToken(token, config, { audience, keyResolver: wrong.publicKey });
  await assert.rejects(new PlatformTicketSource(cfg, "vxture", fetcher, badVerifier).tokenFor(context));
});
test("product assignment response is scoped to exact user, product and workspace", () => {
  const obo = { ...context, subject: "usr", subjectToken: "private" };
  const raw = { product: "karda", subject: "usr", org_id: "o", workspace_id: "w", allowed: true };
  assert.equal(parseProductAccess(raw, obo), true);
  assert.equal(parseProductAccess({ ...raw, allowed: false }, obo), false);
  for (const change of [{ subject: "other" }, { workspace_id: "other" }, { product: "arda" }, { allowed: "true" }]) {
    assert.throws(() => parseProductAccess({ ...raw, ...change }, obo));
  }
});
