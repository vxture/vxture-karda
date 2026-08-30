import { test } from "node:test";
import assert from "node:assert/strict";
import { readiness } from "./readiness";

test("db 坏了就是 fail——一切都在里面,没有它没有产品", () => {
  assert.equal(readiness(false, true).status, "fail");
  assert.equal(readiness(false, false).status, "fail");
});

test("只有 redis 坏是 degraded——浏览器侧登不进,但 S2S 工具面照常供给", () => {
  const r = readiness(true, false);
  assert.equal(r.status, "degraded");
  assert.deepEqual(r.checks, { db: "ok", redis: "fail" });
});

test("未配置是事实不是故障:off 不拉低就绪度", () => {
  assert.equal(readiness(true, null).status, "ready");
  assert.equal(readiness(null, null).status, "ready");
  assert.deepEqual(readiness(null, null).checks, { db: "off", redis: "off" });
});
