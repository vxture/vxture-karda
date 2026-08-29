import { test } from "node:test";
import assert from "node:assert/strict";
import { countConflictGroups } from "./workspace-read";

const r = (kbId: string, subject: string | null, statement: string) => ({ kbId, subject, statement });

test("同库同主题、不同说法才算一组;同一句抽两遍不算", () => {
  assert.equal(
    countConflictGroups([
      r("kb1", "维保周期", "每年"),
      r("kb1", "维保周期", "每半年"),
      r("kb1", "检测机构", "须有资质"),
      r("kb1", "检测机构", "须有资质"),
    ]),
    1,
  );
});

test("同名主题跨库**不并组**——断言不跨库(KD-213),冲突也不跨库", () => {
  assert.equal(
    countConflictGroups([r("kb1", "周期", "每年"), r("kb2", "周期", "每半年")]),
    0,
  );
});

test("subject 大小写与两端空白不敏感;空与全空白不参与", () => {
  assert.equal(
    countConflictGroups([
      r("kb1", "Fire Code", "A"),
      r("kb1", "  fire code ", "B"),
      r("kb1", "   ", "C"),
      r("kb1", null, "D"),
    ]),
    1,
  );
});

test("含空格的 subject 不会和别的键串门——分组键用换行拼接", () => {
  // 「a b」在 kb「x」 与 「b」在 kb「x a」——用空格拼键这两个会撞在一起。
  assert.equal(
    countConflictGroups([r("x", "a b", "S1"), r("x a", "b", "S2")]),
    0,
  );
});
