import { test } from "node:test";
import assert from "node:assert/strict";
import { flushUsage } from "./flush";
import { InMemoryUsageStore } from "./store";

async function seeded(): Promise<InMemoryUsageStore> {
  const s = new InMemoryUsageStore();
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 1, idempotencyKey: "k1" });
  await s.record({ workspaceId: "ws", metric: "ai.credit", amount: 2, idempotencyKey: "k2" });
  return s;
}

test("200 marks rows flushed", async () => {
  const store = await seeded();
  const summary = await flushUsage({ store, consume: async () => ({ status: 200, body: { consumed: 1, remaining_total: 10 } }) });
  assert.equal(summary.flushed, 2);
  assert.equal((await store.unflushed(10)).length, 0);
});

test("acknowledged report with gated=true is terminal and evicts C2", async () => {
  const store = await seeded();
  const evicted: string[] = [];
  const summary = await flushUsage({
    store,
    consume: async () => ({ status: 200, body: { consumed: 0, remaining_total: -2, gated: true } }),
    onGated: (ws) => evicted.push(ws),
  });
  assert.equal(summary.gated, 2);
  assert.equal((await store.unflushed(10)).length, 0); // terminal, not left for retry
  assert.deepEqual(evicted, ["ws", "ws"]);
});

test("5xx / 404 leaves rows buffered for retry", async () => {
  const store = await seeded();
  const summary = await flushUsage({ store, consume: async () => ({ status: 500 }) });
  assert.equal(summary.retried, 2);
  assert.equal((await store.unflushed(10)).length, 2); // still buffered
});

test("a thrown consume error leaves rows buffered", async () => {
  const store = await seeded();
  const summary = await flushUsage({
    store,
    consume: async () => {
      throw new Error("network");
    },
  });
  assert.equal(summary.retried, 2);
  assert.equal((await store.unflushed(10)).length, 2);
});

test("200 without valid receipt and every 409 retain durable usage", async () => {
  for (const result of [{ status: 409 }, { status: 200 }, { status: 200, body: {} },
    { status: 200, body: { consumed: NaN, remaining_total: 0 } },
    { status: 200, body: { consumed: 1, remaining_total: 0, gated: "false" } }]) {
    const store = await seeded();
    assert.equal((await flushUsage({ store, consume: async () => result })).retried, 2);
    assert.equal((await store.unflushed(10)).length, 2);
  }
});
test("a crash after remote receipt retries the original idempotency key", async () => {
  const store = await seeded(); let fail = true;
  const save = store.markFlushed.bind(store);
  store.markFlushed = async keys => { if (fail) throw new Error("database unavailable"); return save(keys); };
  const keys: string[] = [];
  const consume = async (row: { idempotencyKey: string }) => { keys.push(row.idempotencyKey);
    return { status: 200, body: { consumed: 1, remaining_total: 10, event_id: "receipt" } }; };
  await assert.rejects(flushUsage({ store, consume })); fail = false;
  await flushUsage({ store, consume });
  assert.deepEqual(keys, ["k1", "k1", "k2"]);
});
