import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { getOidcConfig } from "./config";

const profile = parseEnv(readFileSync(new URL("../../../../../deploy/config/integration-production.env", import.meta.url), "utf8"));

test("reviewed origin profile overrides old public settings without replacing secrets", () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { NODE_ENV: "production", OIDC_CLIENT_SECRET: "test-secret",
      OIDC_REDIRECT_URI: "https://legacy.invalid/auth/callback",
      NEXT_PUBLIC_APP_URL: "https://legacy.invalid", RP_SESSION_COOKIE_NAME: "" }, profile);
    const cfg = getOidcConfig();
    assert.equal(cfg.enabled, true);
    assert.equal(cfg.issuer, "https://accounts.vxture.com");
    assert.equal(cfg.clientId, "karda");
    assert.equal(cfg.redirectUri, "https://karda.ruyin.work/auth/callback");
    assert.equal(cfg.postLogoutRedirectUri, "https://karda.ruyin.work/");
    assert.equal(cfg.appOrigin, "https://karda.ruyin.work");
    assert.equal(cfg.clientSecret, "test-secret");
    assert.equal(cfg.cookieName, "__Host-vx_rp_session");
    assert.ok(Object.keys(profile).every(key => !/SECRET|TOKEN|PASSWORD/.test(key)));
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});

test("origin fallback supports both real callback paths", () => {
  const saved = { ...process.env };
  try {
    delete process.env.NEXT_PUBLIC_APP_URL;
    for (const path of ["/auth/callback", "/api/auth/oidc/callback"]) {
      process.env.OIDC_REDIRECT_URI = `https://karda.ruyin.work${path}`;
      assert.equal(getOidcConfig().appOrigin, "https://karda.ruyin.work");
    }
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  }
});
