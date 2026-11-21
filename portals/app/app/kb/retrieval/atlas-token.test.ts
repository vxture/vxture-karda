import { test } from "node:test";
import assert from "node:assert/strict";
import { Rfc8693TokenSource } from "./atlas-token";
const cfg = { issuer: "https://accounts.example.test/", clientId: "karda-beta",
  clientSecret: "local-test-only", audience: "atlas" };
const ctx = { org: "o", ws: "w" };
test("Atlas uses verified, scoped Basic exchange; caching follows signed exp", async () => {
  let clock = 0;
  const calls: RequestInit[] = [];
  const fetcher = (async (_url, init) => { calls.push(init!);
    return Response.json({ access_token: "test-token", token_type: "Bearer", expires_in: 999999 }); }) as typeof fetch;
  const source = new Rfc8693TokenSource(cfg, fetcher, () => clock, async () => ({
    aud: "atlas", act: { sub: "karda" }, mode: "service", scope: "tool:atlas",
    org_id: "o", workspace_id: "w", iat: clock / 1000, exp: clock / 1000 + 60,
  }));
  await Promise.all([source.tokenFor(ctx), source.tokenFor(ctx)]);
  assert.equal(calls.length, 1);
  const form = new URLSearchParams(String(calls[0].body));
  assert.equal(form.get("client_secret"), null);
  assert.equal(form.get("workspace_id"), "w");
  assert.equal(form.get("audience"), "atlas");
  assert.match(new Headers(calls[0].headers).get("Authorization")!, /^Basic /);
  clock = 31000;
  await source.tokenFor(ctx);
  assert.equal(calls.length, 2, "expires_in cannot extend signed expiry");
});
test("Atlas rejects unverifiable tokens and mismatched workspace", async () => {
  const fetcher = (async () => Response.json({ access_token: "test-token", token_type: "Bearer" })) as typeof fetch;
  await assert.rejects(new Rfc8693TokenSource(cfg, fetcher, Date.now, async () => { throw new Error("bad signature"); }).tokenFor(ctx));
  const source = new Rfc8693TokenSource(cfg, fetcher, () => 0, async () => ({
    aud: "atlas", act: { sub: "karda" }, mode: "service", scope: "tool:atlas",
    org_id: "o", workspace_id: "other", iat: 0, exp: 300,
  }));
  await assert.rejects(source.tokenFor(ctx), /scope_invalid/);
});
