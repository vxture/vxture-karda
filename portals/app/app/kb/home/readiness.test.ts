import { test } from "node:test";
import assert from "node:assert/strict";
import { assessReadiness, type ReadinessInput } from "./readiness";

const at = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  retrievable: 0,
  documents: 0,
  parkedUnavailable: 0,
  parkedQuota: 0,
  failedResident: 0,
  inflight: 0,
  ...over,
});

// --- 这条规则存在的理由 -------------------------------------------------------

test("驻留在未授权上 ≠ 还没开始 —— 这是这个文件的全部理由", () => {
  // 今天最可能发生的那一种:没有 embedding/default 端点授权,加工管线提交不了,
  // 一份文档都进不了可检索状态。在此之前,界面把它显示成「还没有内容」。
  const r = assessReadiness(at({ documents: 12, parkedUnavailable: 12 }));
  assert.equal(r.state, "unavailable");
  assert.equal(r.reason, "capability_not_granted");
  assert.notEqual(r.state, "empty", "把不可用显示成还没开始,是这套界面最贵的一处失真");
});

test("真的什么都没有,才是 empty,而且给的是「怎么建第一个」", () => {
  const r = assessReadiness(at());
  assert.equal(r.state, "empty");
  assert.equal(r.reason, "nothing_ingested");
  assert.deepEqual(r.action, { kind: "page", href: "/assets/new" });
});

test("有文档但都还没走完,是「等一会」,既不是坏也不是还没开始", () => {
  const r = assessReadiness(at({ documents: 3, inflight: 3 }));
  assert.equal(r.state, "unavailable");
  assert.equal(r.reason, "processing");
  assert.deepEqual(r.action, { kind: "page", href: "/pipeline/tasks" });
});

// --- 能用不等于全都好 ---------------------------------------------------------

test("有可检索内容且无人在等,才是 ready", () => {
  const r = assessReadiness(at({ retrievable: 40, documents: 40 }));
  assert.equal(r.state, "ready");
  assert.equal(r.reason, null);
  assert.equal(r.action, null);
});

test("有内容但仍有驻留,是 degraded —— 不能因为能用就不报", () => {
  const r = assessReadiness(at({ retrievable: 40, documents: 52, parkedUnavailable: 12 }));
  assert.equal(r.state, "degraded");
  assert.equal(r.reason, "capability_not_granted");
});

test("有内容但有常驻失败,也报 degraded 并指向任务页", () => {
  const r = assessReadiness(at({ retrievable: 40, documents: 41, failedResident: 1 }));
  assert.deepEqual([r.state, r.reason], ["degraded", "failures_resident"]);
  assert.deepEqual(r.action, { kind: "page", href: "/pipeline/tasks" });
});

// --- 下一步的种类 -------------------------------------------------------------

test("能力未授权给的是 ops 指路,不是站内链接", () => {
  // 那件事不在这个应用里。做成链接是骗人——点了会发现没有那一页。
  const r = assessReadiness(at({ parkedUnavailable: 5 }));
  assert.equal(r.action?.kind, "ops");
  assert.match(r.action?.runbook ?? "", /40-run-atlas-endpoint-grants/);
  assert.equal(r.action?.href, undefined);
});

test("配额驻留不给下一步 —— 它会自己好,指向任何地方都是徒增动作", () => {
  const r = assessReadiness(at({ parkedQuota: 3 }));
  assert.deepEqual([r.state, r.reason, r.action], ["unavailable", "quota_exhausted", null]);
});

// --- 优先级 -------------------------------------------------------------------

test("同时驻留时,未授权压过配额 —— 前者要人去做事,后者不用", () => {
  const r = assessReadiness(at({ parkedUnavailable: 1, parkedQuota: 9 }));
  assert.equal(r.reason, "capability_not_granted");
});

test("判断永远从「有没有可检索内容」出发,不从任务数推断", () => {
  // 任务全绿但语料为零,仍然不是 ready:能不能用的定义是有没有内容可检索。
  const r = assessReadiness(at({ retrievable: 0, documents: 0, inflight: 0 }));
  assert.notEqual(r.state, "ready");
});

test("facts 原样带回,判断可以被读的人自己复核", () => {
  const input = at({ retrievable: 7, documents: 9, failedResident: 2 });
  assert.deepEqual(assessReadiness(input).facts, input);
});
