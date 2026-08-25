import test from "node:test";
import assert from "node:assert/strict";
import { ApiError } from "./api";

// `need` is not exported - it is exercised through the helpers, which is the
// point: the guard exists so a WRONG ENVELOPE KEY fails at the fetch boundary
// instead of putting `undefined` into page state and crashing a render that has
// nothing to do with the request. That is a bug we actually shipped: a PATCH
// read `kb` where every kb route sends `knowledgeBase`.

function withFetch<T>(body: unknown, status: number, fn: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  return fn().finally(() => {
    globalThis.fetch = original;
  });
}

test("a response missing its envelope key throws instead of returning undefined", async () => {
  const { getKb } = await import("./api");
  await assert.rejects(
    () => withFetch({ kb: { id: "x" } }, 200, () => getKb("k1")),
    (e: unknown) => {
      assert.ok(e instanceof ApiError);
      // The message names the endpoint AND the key, so the fix is obvious from
      // the error alone.
      assert.match(e.message, /malformed_response/);
      assert.match(e.message, /knowledgeBase/);
      return true;
    },
  );
});

test("a null value under the right key is also malformed, not a valid library", async () => {
  const { getKb } = await import("./api");
  await assert.rejects(() => withFetch({ knowledgeBase: null }, 200, () => getKb("k1")), ApiError);
});

test("a well-formed response passes through untouched", async () => {
  const { getKb } = await import("./api");
  const kb = await withFetch({ knowledgeBase: { id: "k1", name: "库" } }, 200, () => getKb("k1"));
  assert.equal(kb.id, "k1");
});

test("an HTTP error still reports its own status, not malformed_response", async () => {
  const { getKb } = await import("./api");
  await assert.rejects(
    () => withFetch({ error: "not_found" }, 404, () => getKb("k1")),
    (e: unknown) => {
      assert.ok(e instanceof ApiError);
      assert.equal(e.status, 404);
      assert.equal(e.code, "not_found");
      return true;
    },
  );
});

test("an empty list is a VALID answer - the guard must not reject it", async () => {
  // A guard that treated [] as missing would break every empty-state page.
  const { listKbs } = await import("./api");
  const kbs = await withFetch({ knowledgeBases: [] }, 200, () => listKbs());
  assert.deepEqual(kbs, []);
});
