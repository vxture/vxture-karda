import { test } from "node:test";
import assert from "node:assert/strict";
import { readiness } from "./readiness";

test("database failure closes readiness", () => {
  assert.equal(readiness(false, true).status, "fail");
  assert.equal(readiness(false, false).status, "fail");
});

test("Redis failure closes readiness for shared service admission too", () => {
  const r = readiness(true, false, true);
  assert.equal(r.status, "fail");
  assert.deepEqual(r.checks, { db: "ok", redis: "fail" });
});

test("offline development can omit dependencies", () => {
  assert.equal(readiness(true, null).status, "ready");
  assert.equal(readiness(null, null).status, "ready");
  assert.deepEqual(readiness(null, null).checks, { db: "off", redis: "off" });
});

test("deployed readiness refuses every missing dependency combination", () => {
  for (const [db, redis] of [[null, true], [true, null], [null, null]] as const) {
    const r = readiness(db, redis, true);
    assert.equal(r.status, "fail");
    assert.deepEqual(r.checks, {
      db: db === null ? "off" : "ok", redis: redis === null ? "off" : "ok",
    });
  }
});

test("healthy deployed dependencies admit readiness", () => {
  assert.deepEqual(readiness(true, true, true), {
    status: "ready", checks: { db: "ok", redis: "ok" },
  });
});
