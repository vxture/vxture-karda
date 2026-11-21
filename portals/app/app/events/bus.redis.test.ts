import { test } from "node:test";
import assert from "node:assert/strict";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { EventBus, sessionTarget, workspaceTarget, type Invalidation } from "./bus";
import { putSession, deleteSessionsBySid, deleteSession, getSession, closeSessionStore } from "../auth/lib/session-store";

const endpoint = process.env.KARDA_SESSION_TEST_REDIS_URL;
test("isolated Redis: durable versions, replica fanout, duplicate recovery and atomic logout", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/15"); assert.equal(process.env.REDIS_URL, endpoint);
  const cid = `karda-p7-${randomUUID()}`;
  const a = new EventBus(endpoint!, cid), b = new EventBus(endpoint!, cid);
  const other = new EventBus(endpoint!, `${cid}-beta`);
  const r = new Redis(endpoint!);
  const received: Invalidation[] = [], foreign: Invalidation[] = [];
  let stop = () => {}, stopOther = () => {};
  const settle = async () => { await new Promise(resolve => setTimeout(resolve, 30)); };
  try {
    stop = await b.listen(event => received.push(event), () => {});
    stopOther = await other.listen(event => foreign.push(event), () => {});
    assert.equal(await b.version("ws-a"), "0");
    await a.publishWorkspace("ws-a", "1"); await settle();
    const revision = await b.version("ws-a");
    assert.notEqual(revision, "0"); assert.equal(received.length, 1);
    assert.equal(received[0].target, workspaceTarget("ws-a"));
    assert.equal(foreign.length, 0); assert.equal(await b.version("ws-b"), "0");
    await a.publishWorkspace("ws-a", "1"); await settle();
    assert.equal(received.length, 1, "delivery replay is idempotent");
    stop(); await a.publishWorkspace("ws-a", "2");
    const missed = await b.version("ws-a"); assert.notEqual(missed, revision);
    stop = await b.listen(event => received.push(event), () => {});
    assert.equal(await b.version("ws-a"), missed, "reconnect recovers without historical permission replay");
    await a.publishWorkspace("ws-a", "3"); await settle();
    const count = received.length;
    await a.publishWorkspace("ws-a", "3"); await a.publishWorkspace("ws-a", "1"); await settle();
    assert.equal(received.length, count, "unchanged reconciliation produces no event");
    const restored = new EventBus(endpoint!, cid, async () => "7");
    try {
      assert.equal(await restored.version("ws-lost"), "7", "lost Redis revisions recover from the durable database snapshot");
      await a.publishWorkspace("ws-lost", "6");
      assert.equal(await restored.version("ws-lost"), "7", "late publishers cannot roll the durable generation backwards");
    } finally { await restored.close(); }
    const session = { sub: "usr", sid: "central", accessToken: "a", idToken: "i", accessExpiresAt: Math.floor(Date.now()/1000)+100 };
    await putSession(cid, "first", session, 120); await putSession(cid, "second", session, 120);
    await deleteSessionsBySid(cid, "central"); await settle();
    assert.equal(await getSession(cid, "first"), null); assert.equal(await getSession(cid, "second"), null);
    for (const id of ["first", "second"]) assert.ok(received.some(event => event.kind === "revoked" && event.target === sessionTarget(id)));
    await putSession(cid, "local", session, 120); await deleteSession(cid, "local"); await settle();
    assert.ok(received.some(event => event.target === sessionTarget("local") && event.kind === "revoked"));
  } finally {
    stop(); stopOther(); await Promise.all([a.close(), b.close(), other.close(), closeSessionStore()]);
    for (const key of await r.keys(`vx:rp:${cid}*`)) await r.del(key);
    await r.quit();
  }
});
