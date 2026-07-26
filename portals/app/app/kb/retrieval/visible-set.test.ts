import { test } from "node:test";
import assert from "node:assert/strict";
import { VisibleSetResolver } from "./visible-set";
import { VISIBLE_SET_TTL_MS } from "./scope";
import { InMemoryKbStore } from "../lib/store";

async function seeded() {
  const kbs = new InMemoryKbStore();
  const mine = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "mine" });
  const others = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u2", name: "others" }); // private, not mine
  const pub = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u2", name: "pub" });
  await kbs.updateKb(pub.id, { publishState: "ws_published" });
  return { kbs, mineId: mine.id, othersId: others.id, pubId: pub.id };
}

const input = { org: "org1", ws: "ws1", product: "agent", user: "u1" };

test("the org visible set = libraries I own OR that are published to the workspace/org", async () => {
  const { kbs, mineId, othersId, pubId } = await seeded();
  const set = await new VisibleSetResolver(kbs).resolve(input, 1000);
  const ids = set.map((s) => s.kbId).sort();
  assert.deepEqual(ids, [mineId, pubId].sort(), "own + published; another's private excluded");
  assert.ok(!ids.includes(othersId));
  assert.ok(set.every((s) => s.namespace === "org"));
});

test("the visible set is cached by (org,ws,product,user) and evicts on TTL / invalidate", async () => {
  const { kbs } = await seeded();
  const r = new VisibleSetResolver(kbs);
  const first = await r.resolve(input, 1000);
  const n0 = first.length;

  // add a visible library; within TTL the cached set does not see it
  const extra = await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "extra" });
  assert.equal((await r.resolve(input, 1000 + 100)).length, n0, "served from cache");

  // after the TTL it refetches and picks up the new library
  const later = await r.resolve(input, 1000 + VISIBLE_SET_TTL_MS + 1);
  assert.equal(later.length, n0 + 1);
  assert.ok(later.some((s) => s.kbId === extra.id));

  // explicit invalidation forces a refetch immediately
  await kbs.createKb({ workspaceId: "ws1", ownerType: "user", ownerSub: "u1", name: "extra2" });
  r.invalidate(input);
  assert.equal((await r.resolve(input, 1000 + VISIBLE_SET_TTL_MS + 2)).length, n0 + 2);
});
