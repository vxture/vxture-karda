import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeLibraryKarda, emptyLibraryKarda } from "./library-read";

const g = (verificationState: string, n: number) => ({ verificationState, _count: { _all: n } });

test("总数是分档之和,不是另发一次 count", () => {
  const r = shapeLibraryKarda([g("unverified", 12), g("verified", 30), g("stale", 3)], 2, 44, null);
  assert.equal(r.assertions, 45);
  assert.equal(r.unverified, 12);
  assert.equal(r.verified, 30);
  assert.equal(r.stale, 3);
});

test("没列举的档位仍然计入总数,不会凭空消失", () => {
  // 这正是「总数另发一次 count」换成「分档相加」要保住的性质:验证状态机以后多一
  // 档时,这一页会少报一个数,而少报的那个数看起来完全正常——没有任何东西会报错。
  const r = shapeLibraryKarda([g("unverified", 5), g("quarantined", 7)], 0, 0, null);
  assert.equal(r.assertions, 12);
  assert.equal(r.unverified, 5);
});

test("从没抽过时 lastExtractedAt 是 null,而不是一个纪元时间", () => {
  const r = shapeLibraryKarda([], 0, 0, null);
  assert.deepEqual(r, emptyLibraryKarda());
  assert.equal(r.lastExtractedAt, null);
});

test("抽过就带上时间,界面据此区分「还没跑过」与「跑过但没抽到」", () => {
  const when = new Date("2026-08-30T02:00:00.000Z");
  const r = shapeLibraryKarda([], 0, 0, when);
  assert.equal(r.assertions, 0);
  assert.equal(r.lastExtractedAt, "2026-08-30T02:00:00.000Z");
});
