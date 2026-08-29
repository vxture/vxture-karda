import { test } from "node:test";
import assert from "node:assert/strict";
import { groupConflicts, confirmationExpiry, type KnowledgeAssertion } from "./curate";

let n = 0;
function item(patch: Partial<KnowledgeAssertion>): KnowledgeAssertion {
  n += 1;
  return {
    id: `a_${n}`,
    kind: "fact",
    subject: null,
    statement: `s${n}`,
    assertedBy: null,
    asOf: null,
    validUntil: null,
    confidence: null,
    contentState: "draft",
    verificationState: "unverified",
    verifier: null,
    verifiedAt: null,
    supersededById: null,
    createdAt: `2026-08-30T00:00:${String(n).padStart(2, "0")}.000Z`,
    evidence: null,
    ...patch,
  };
}

test("同一 subject、不同 statement 才是冲突;同一句抽两遍不是", () => {
  const groups = groupConflicts([
    item({ subject: "维保周期", statement: "每年一次" }),
    item({ subject: "维保周期", statement: "每半年一次" }),
    item({ subject: "检测机构", statement: "须有资质" }),
    item({ subject: "检测机构", statement: "须有资质" }), // 重复,不是冲突
  ]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].subject, "维保周期");
  assert.equal(groups[0].items.length, 2);
});

test("subject 匹配大小写与两端空白不敏感——「同一件事」不该因抄写差异而分家", () => {
  const groups = groupConflicts([
    item({ subject: "Fire Code", statement: "A" }),
    item({ subject: "  fire code ", statement: "B" }),
  ]);
  assert.equal(groups.length, 1);
});

test("已裁决的输家不再是候选——否则裁完还在队列里,队列永远清不掉", () => {
  const groups = groupConflicts([
    item({ subject: "周期", statement: "每年", supersededById: null }),
    item({ subject: "周期", statement: "每半年", supersededById: "a_1" }),
  ]);
  assert.deepEqual(groups, []);
});

test("没有 subject 的断言不参与冲突——没有「同一件事」可言", () => {
  assert.deepEqual(
    groupConflicts([item({ subject: null, statement: "A" }), item({ subject: null, statement: "B" })]),
    [],
  );
});

test("组内新的在前,组间大的在前", () => {
  const groups = groupConflicts([
    item({ subject: "小组", statement: "A", createdAt: "2026-08-01T00:00:00.000Z" }),
    item({ subject: "小组", statement: "B", createdAt: "2026-08-02T00:00:00.000Z" }),
    item({ subject: "大组", statement: "X" }),
    item({ subject: "大组", statement: "Y" }),
    item({ subject: "大组", statement: "Z" }),
  ]);
  assert.equal(groups[0].subject, "大组");
  assert.equal(groups[1].items[0].statement, "B");
});

test("复验钟只在治理开且设了周期时上——断言不单开第二套治理", () => {
  const now = new Date("2026-08-30T00:00:00.000Z");
  assert.equal(confirmationExpiry({ governanceEnabled: false, defaultVerifyIntervalDays: 30 }, now), null);
  assert.equal(confirmationExpiry({ governanceEnabled: true, defaultVerifyIntervalDays: null }, now), null);
  assert.equal(
    confirmationExpiry({ governanceEnabled: true, defaultVerifyIntervalDays: 30 }, now)?.toISOString(),
    "2026-09-29T00:00:00.000Z",
  );
});
