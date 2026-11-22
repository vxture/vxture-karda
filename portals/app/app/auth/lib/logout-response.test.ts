import { test } from "node:test";
import assert from "node:assert/strict";
import { completeLogout } from "./logout-response";
import { getOidcConfig } from "./config";

const cfg = { ...getOidcConfig(), clientId: "karda", cookieName: "__Host-vx_rp_session",
  postLogoutRedirectUri: "https://karda.ruyin.work/" };
test("successful logout deletes local session, expires host cookie and converts POST to Accounts GET", async () => {
  let deleted = false;
  const res = await completeLogout(cfg, "opaque-session", {
    async deleteSession(clientId, sid) { assert.equal(clientId, "karda"); assert.equal(sid, "opaque-session"); deleted = true; },
    state() { assert.ok(deleted); return "nonce"; },
  });
  assert.equal(res.status, 303);
  const dest = new URL(res.headers.get("location")!);
  assert.equal(dest.origin, "https://accounts.vxture.com");
  assert.equal(dest.searchParams.get("client_id"), "karda");
  assert.equal(dest.searchParams.get("post_logout_redirect_uri"), cfg.postLogoutRedirectUri);
  assert.match(res.headers.get("set-cookie")!, /__Host-vx_rp_session=;.*Max-Age=0/i);
  assert.equal(res.headers.get("cache-control"), "no-store");
});
test("failed local deletion neither redirects nor clears cookie", async () => {
  const res = await completeLogout(cfg, "opaque-session", {
    async deleteSession() { throw new Error("private Redis detail"); },
    state() { throw new Error("must not redirect"); },
  });
  assert.equal(res.status, 503);
  assert.equal(res.headers.get("set-cookie"), null);
  assert.equal(res.headers.get("location"), null);
  assert.deepEqual(await res.json(), { error: "session_unavailable" });
});
