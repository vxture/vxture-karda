import { test } from "node:test";
import assert from "node:assert/strict";
import { getAuthUser, resolveSessionUser, type SessionDeps } from "./session";
import { getOidcConfig } from "./config";
import type { RpSession } from "./session-store";

function harness() {
  let current: RpSession | null = { accessToken: "old", idToken: "id", refreshToken: "refresh",
    accessExpiresAt: 1010, sid: "sid", sub: "usr_one" };
  let rotations = 0;
  let refreshes = 0;
  let tail: Promise<unknown> = Promise.resolve();
  const deps: SessionDeps = {
    now: () => 1000,
    async central() { return { valid: true, next_check_at: 1300 }; },
    async revoke() { current = null; },
    async read() { return current ? { ...current } : null; },
    async lock(_cid, _id, work) {
      const next = tail.then(() => work("owner")); tail = next.catch(() => {}); return next;
    },
    async rotate(_cid, _id, expected, next) {
      if (!current) return false;
      assert.equal(current.accessToken, expected); current = next; rotations++; return true;
    },
    async refresh() { refreshes++; await new Promise(resolve => setTimeout(resolve, 10));
      return { access_token: "new", token_type: "Bearer", refresh_token: "rotated", expires_in: 99999 }; },
    async verify() { return { sub: "usr_one", sid: "sid", exp: 1400,
      active_org: "org", active_workspace: "ws", roles: ["workspace:member"] }; },
  };
  return { deps, drop: () => { current = null; }, current: () => current,
    counts: () => ({ rotations, refreshes }) };
}

test("concurrent reads rotate once and waiters use the committed result", async () => {
  const h = harness();
  const users = await Promise.all(Array.from({ length: 8 }, () => getAuthUser(getOidcConfig(), "rp", h.deps)));
  assert.ok(users.every(user => user?.sub === "usr_one"));
  assert.deepEqual(h.counts(), { rotations: 1, refreshes: 1 });
  assert.equal(h.current()?.accessExpiresAt, 1400, "signed expiry wins over expires_in");
});

test("logout during refresh cannot resume or recreate a session", async () => {
  const h = harness(); const refresh = h.deps.refresh;
  h.deps.refresh = async (...args) => { const value = await refresh(...args); h.drop(); return value; };
  assert.equal(await getAuthUser(getOidcConfig(), "rp", h.deps), null);
  assert.equal(h.current(), null); assert.equal(h.counts().rotations, 0);
});

test("bad refresh identity, sid, expiry or role shape never commits", async () => {
  for (const claims of [{ sub: "other", sid: "sid", exp: 1400 },
    { sub: "usr_one", sid: "other", exp: 1400 }, { sub: "usr_one", exp: 900 },
    { sub: "usr_one", exp: 1400, roles: [123] }]) {
    const h = harness(); h.deps.verify = async () => claims;
    await assert.rejects(getAuthUser(getOidcConfig(), "rp", h.deps));
    assert.equal(h.current()?.accessToken, "old"); assert.equal(h.counts().rotations, 0);
  }
});

test("refresh outage preserves stored session and is unavailable rather than anonymous", async () => {
  const h = harness(); h.deps.refresh = async () => { throw new Error("network down"); };
  const result = await resolveSessionUser(getOidcConfig(), "rp", (cfg, id) => getAuthUser(cfg, id, h.deps));
  assert.deepEqual(result, { available: false, user: null });
  assert.equal(h.current()?.refreshToken, "refresh");
  h.drop();
  assert.deepEqual(await resolveSessionUser(getOidcConfig(), "rp", (cfg, id) => getAuthUser(cfg, id, h.deps)),
    { available: true, user: null });
});

test("revocation while verifying an otherwise fresh token wins", async () => {
  const h = harness(); h.current()!.accessExpiresAt = 1400; h.current()!.centralNextCheckAt = 1300;
  const verify = h.deps.verify;
  h.deps.verify = async (...args) => { h.drop(); return verify(...args); };
  assert.equal(await getAuthUser(getOidcConfig(), "rp", h.deps), null);
});

test("only explicit central invalidation revokes; unavailable preserves authority", async () => {
  const h = harness();
  h.deps.central = async () => { throw new Error("Accounts unavailable"); };
  await assert.rejects(getAuthUser(getOidcConfig(), "rp", h.deps));
  assert.ok(h.current()); assert.equal(h.counts().refreshes, 0);
  h.deps.central = async () => ({ valid: false });
  assert.equal(await getAuthUser(getOidcConfig(), "rp", h.deps), null);
  assert.equal(h.current(), null);
});

test("a future status deadline avoids Accounts checks on ordinary reads", async () => {
  const h = harness(); h.current()!.accessExpiresAt = 1400; h.current()!.centralNextCheckAt = 1300;
  h.deps.central = async () => { throw new Error("must not call Accounts"); };
  assert.equal((await getAuthUser(getOidcConfig(), "rp", h.deps))?.sub, "usr_one");
  assert.deepEqual(h.counts(), { rotations: 0, refreshes: 0 });
});
