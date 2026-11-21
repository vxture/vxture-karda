import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { getAuthUser, type SessionDeps } from "./session";
import { getOidcConfig } from "./config";
import { getSession, putSession, rotateSession, withSessionLock, deleteSessionsBySid,
  deleteSession, closeSessionStore, type RpSession } from "./session-store";

const endpoint = process.env.KARDA_SESSION_TEST_REDIS_URL;
test("isolated Redis: concurrent rotation, revocation, TTL and owner fencing", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/15", "only a disposable loopback DB15 is allowed");
  assert.equal(process.env.REDIS_URL, endpoint, "store must target the same isolated endpoint");
  const r = new Redis(endpoint!);
  const cid = `karda-p1-test-${randomUUID()}`;
  const cfg = { ...getOidcConfig(), clientId: cid };
  const now = Math.floor(Date.now() / 1000);
  const original: RpSession = { sub: "usr_test", sid: "central", accessToken: "old",
    idToken: "id", refreshToken: "refresh", accessExpiresAt: now + 5 };
  const key = (id: string) => `vx:rp:${cid}:sess:${id}`;
  let refreshes = 0;
  const deps: SessionDeps = { read: getSession, rotate: rotateSession, lock: withSessionLock,
    central: async () => ({ valid: true, next_check_at: now + 200 }), revoke: deleteSessionsBySid,
    now: () => now, async verify() { return { sub: "usr_test", sid: "central", exp: now + 300 }; },
    async refresh() { refreshes++; await new Promise(resolve => setTimeout(resolve, 60));
      return { access_token: "new", refresh_token: "new-refresh", token_type: "Bearer" }; } };
  try {
    await putSession(cid, "concurrent", original, 120);
    const before = await r.pttl(key("concurrent"));
    const users = await Promise.all(Array.from({ length: 6 }, () => getAuthUser(cfg, "concurrent", deps)));
    assert.ok(users.every(user => user?.sub === "usr_test")); assert.equal(refreshes, 1);
    const after = await r.pttl(key("concurrent")); assert.ok(after > 0 && after <= before);

    await putSession(cid, "revoked", original, 120);
    let entered!: () => void; let finish!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const release = new Promise<void>(resolve => { finish = resolve; });
    const pending = getAuthUser(cfg, "revoked", { ...deps,
      async refresh() { entered(); await release; return { access_token: "new", token_type: "Bearer" }; } });
    await started; await deleteSessionsBySid(cid, "central"); finish();
    assert.equal(await pending, null); assert.equal(await getSession(cid, "revoked"), null);
    assert.equal(await getSession(cid, "concurrent"), null, "all sessions for the sid revoked");

    await putSession(cid, "expired", original, 120);
    await withSessionLock(cid, "expired", async owner => {
      await r.pexpire(key("expired"), 1); await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(await rotateSession(cid, "expired", "old", { ...original, accessToken: "new" }, owner), false);
    });
    await putSession(cid, "fenced", original, 120);
    await withSessionLock(cid, "fenced", async owner => {
      await r.set(`vx:rp:${cid}:lock:fenced`, "other-owner", "PX", 1000);
      await assert.rejects(rotateSession(cid, "fenced", "old", { ...original, accessToken: "new" }, owner));
    });
    assert.equal((await getSession(cid, "fenced"))?.accessToken, "old");
    await deleteSession(cid, "fenced");
    assert.equal(await getSession(cid, "fenced"), null);
  } finally {
    // Delete only this test's random prefix, never FLUSHDB.
    let cursor = "0";
    do { const page = await r.scan(cursor, "MATCH", `vx:rp:${cid}:*`, "COUNT", 100);
      cursor = page[0]; if (page[1].length) await r.del(...page[1]); } while (cursor !== "0");
    await r.quit();
    await closeSessionStore();
  }
});
