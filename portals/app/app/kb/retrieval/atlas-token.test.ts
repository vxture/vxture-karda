import { test } from "node:test";
import assert from "node:assert/strict";
import { Rfc8693TokenSource, type AtlasTokenConfig } from "./atlas-token";

const cfg: AtlasTokenConfig = {
  issuer: "http://100.76.219.48:8080/",
  clientId: "karda",
  clientSecret: "shh",
  audience: "atlas",
};

interface Captured {
  url: string | URL;
  init?: RequestInit;
}

function fakeFetch(
  status: number,
  body: unknown,
): { fetch: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const ctx = { org: "org1", ws: "ws1" };

test("mint posts the RFC 8693 service-mode form to {issuer}/oidc/token", async () => {
  const { fetch: f, calls } = fakeFetch(200, { access_token: "AT", expires_in: 300 });
  const src = new Rfc8693TokenSource(cfg, f, () => 1000);
  const token = await src.tokenFor(ctx);
  assert.equal(token, "AT");
  assert.equal(calls.length, 1);
  // issuer trailing slash is collapsed, not doubled
  assert.equal(String(calls[0].url), "http://100.76.219.48:8080/oidc/token");
  assert.equal((calls[0].init?.headers as Record<string, string>)["content-type"], "application/x-www-form-urlencoded");
  const form = new URLSearchParams(calls[0].init?.body as string);
  assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:token-exchange");
  assert.equal(form.get("audience"), "atlas");
  assert.equal(form.get("client_id"), "karda");
  assert.equal(form.get("client_secret"), "shh");
  assert.deepEqual(JSON.parse(form.get("requested_context") ?? "{}"), { org_id: "org1", workspace_id: "ws1" });
  // service mode: no subject_token
  assert.equal(form.get("subject_token"), null);
});

test("a cached token is reused until the refresh margin, then re-minted", async () => {
  const { fetch: f, calls } = fakeFetch(200, { access_token: "AT", expires_in: 300 });
  let clock = 0;
  const src = new Rfc8693TokenSource(cfg, f, () => clock);

  await src.tokenFor(ctx); // mint at t=0, valid ~270s (300s - 30s margin)
  clock = 100_000; // still inside the window
  await src.tokenFor(ctx);
  assert.equal(calls.length, 1, "second call within TTL reuses the cache");

  clock = 280_000; // past the margin-adjusted expiry
  await src.tokenFor(ctx);
  assert.equal(calls.length, 2, "expired token is re-minted");
});

test("different (org, ws) contexts are cached independently", async () => {
  const { fetch: f, calls } = fakeFetch(200, { access_token: "AT", expires_in: 300 });
  const src = new Rfc8693TokenSource(cfg, f, () => 0);
  await src.tokenFor({ org: "orgA", ws: "wsA" });
  await src.tokenFor({ org: "orgA", ws: "wsB" });
  await src.tokenFor({ org: "orgA", ws: "wsA" });
  assert.equal(calls.length, 2, "each distinct context mints once; the repeat is cached");
});

test("a non-2xx mint, and a 2xx without access_token, both throw", async () => {
  await assert.rejects(
    new Rfc8693TokenSource(cfg, fakeFetch(401, {}).fetch, () => 0).tokenFor(ctx),
    /token-exchange 401/,
  );
  await assert.rejects(
    new Rfc8693TokenSource(cfg, fakeFetch(200, { nope: true }).fetch, () => 0).tokenFor(ctx),
    /no access_token/,
  );
});
