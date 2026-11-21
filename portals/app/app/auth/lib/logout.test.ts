import { test } from "node:test";
import assert from "node:assert/strict";
import { endSessionUrl, logoutSid, revokeLogoutSessions } from "./logout";

const valid = () => ({ sid: "customer-session", jti: "delivery", iat: 100, exp: 220,
  events: { "http://schemas.openid.net/event/backchannel-logout": {} } });

test("logout rejects malformed signed payloads rather than deleting sessions", () => {
  assert.equal(logoutSid(valid()), "customer-session");
  for (const patch of [{ nonce: "forbidden" }, { jti: undefined }, { sid: "" },
    { iat: 1.5 }, { exp: undefined }, { exp: 90 }, { events: null },
    { events: { "http://schemas.openid.net/event/backchannel-logout": null } },
    { events: { "http://schemas.openid.net/event/backchannel-logout": [] } }]) {
    assert.throws(() => logoutSid({ ...valid(), ...patch }));
  }
});

test("partial deletion failure is retryable with the same delivery", async () => {
  const sessions = new Set(["one", "two"]);
  let fail = true;
  const store = {
    async sessionsForSid(cid: string, sid: string) {
      assert.equal(cid, "karda"); assert.equal(sid, "customer-session"); return [...sessions];
    },
    async deleteSession(_cid: string, id: string) {
      if (id === "two" && fail) throw new Error("redis unavailable");
      sessions.delete(id);
    },
  };
  await assert.rejects(revokeLogoutSessions("karda", logoutSid(valid()), store));
  assert.deepEqual([...sessions], ["two"]);
  fail = false;
  await revokeLogoutSessions("karda", logoutSid(valid()), store);
  await revokeLogoutSessions("karda", logoutSid(valid()), store);
  assert.equal(sessions.size, 0);
});

test("end-session identifies the customer client for production and beta", () => {
  for (const clientId of ["karda", "karda-beta"]) {
    const url = new URL(endSessionUrl({ endSessionUrl: "https://accounts.vxture.com/oidc/end_session",
      clientId, postLogoutRedirectUri: "https://product.example/" }, "nonce"));
    assert.equal(url.searchParams.get("client_id"), clientId);
    assert.equal(url.searchParams.get("post_logout_redirect_uri"), "https://product.example/");
    assert.equal(url.searchParams.get("state"), "nonce");
  }
});
