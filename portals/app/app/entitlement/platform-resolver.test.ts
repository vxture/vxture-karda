import { test } from "node:test";
import assert from "node:assert/strict";
import { PlatformEntitlementResolver } from "./platform-resolver";
import { makeEntitlement, getEntitlementResolver, resetResolver } from "./resolver";
import { validateEntitlementScope } from "./platform-client";
const cfg = { baseUrl: "https://platform.example.test", product: "karda" };
const value = makeEntitlement("w", "karda", { tier: "pro", status: "active" });
test("expired cached entitlements never mask authority failure", async () => {
  let now = 0, fail = false, calls = 0;
  const resolver = new PlatformEntitlementResolver(cfg, async () => { calls++; if (fail) throw new Error("offline"); return value; }, () => now);
  await resolver.resolve("w"); fail = true;
  await resolver.resolve("w"); assert.equal(calls, 1);
  now = 45001;
  await assert.rejects(resolver.resolve("w"), /offline/);
});
test("invalidation prevents an in-flight old value from repopulating cache", async () => {
  let finish!: () => void, calls = 0;
  const blocked = new Promise<void>(r => { finish = r; });
  const resolver = new PlatformEntitlementResolver(cfg, async () => { calls++; await blocked; return value; });
  const first = resolver.resolve("w"); resolver.invalidate("w"); finish(); await first;
  await resolver.resolve("w"); assert.equal(calls, 2);
  const context = { orgId: "o", workspaceId: "w", subject: "usr", subjectToken: "private" };
  await resolver.resolve("w", context); await resolver.resolve("w", context);
  assert.equal(calls, 4, "user admission bypasses service cache");
});
test("C2 scope and malformed numeric data fail closed, additive fields survive", () => {
  validateEntitlementScope({ ...value, future: true }, "w", "karda");
  for (const change of [{ workspace_id: "other" }, { product: "other" }, { tier: "invented" },
    { bundled: null }, { limits: { seats: Infinity } }, { quota_pools: [{ metric: "x", limit: 0, remaining: NaN }] }]) {
    assert.throws(() => validateEntitlementScope({ ...value, ...change }, "w", "karda"));
  }
});
test("deployed commercial authorization cannot use mock override", () => {
  const saved = { ...process.env };
  try {
    process.env.DEPLOY_STAGE = "production"; process.env.ALLOW_MOCK_ON_DEPLOY = "on";
    delete process.env.PLATFORM_API_URL; resetResolver();
    assert.throws(getEntitlementResolver, /unconfigured/);
  } finally { process.env = saved; resetResolver(); }
});


test("shared revision changes invalidate another replica and fence late cache writes", async () => {
  let revision = "a", calls = 0;
  const resolver = new PlatformEntitlementResolver(cfg, async () => { calls++; return value; }, Date.now, async () => revision);
  await resolver.resolve("w"); await resolver.resolve("w"); assert.equal(calls, 1);
  revision = "b"; await resolver.resolve("w"); assert.equal(calls, 2);
  let finish!: () => void;
  const blocked = new Promise<void>(resolve => { finish = resolve; });
  const late = new PlatformEntitlementResolver(cfg, async () => { calls++; await blocked; return value; }, Date.now, async () => revision);
  const pending = late.resolve("w"); await new Promise(resolve => setTimeout(resolve, 0));
  revision = "c"; finish(); await pending;
  await late.resolve("w"); assert.equal(calls, 4, "late old-version response is never cached");
});
