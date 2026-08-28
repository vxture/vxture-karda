import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeUnavailable, encodeUnavailable, unavailableReason, UnavailableError } from "./unavailable";

// --- 这个文件存在的理由 -------------------------------------------------------

test("四档不能塌成一句 —— 分档的依据是修复人不同", () => {
  // owner 2026-08-28 纠正的那件事:产品把四种「用不了」压成同一句「模型能力尚未
  // 授权」。它们的修复人分别是运维、平台、平台管理面、库属主——只说「未授权」等于
  // 谁都不知道该动手。这条测试钉的是「四个码互不相等」这一件事本身。
  const all = [
    encodeUnavailable({ cause: "atlas_not_configured", arg: null }),
    encodeUnavailable({ cause: "workspace_not_provisioned", arg: null }),
    encodeUnavailable({ cause: "endpoint_not_granted", arg: "embedding/default" }),
    encodeUnavailable({ cause: "model_not_routable", arg: "bge-m3" }),
  ];
  assert.equal(new Set(all).size, 4);
});

// --- 编解码 -------------------------------------------------------------------

test("带参数的往返:端点码里有斜杠,不能被当成分隔符", () => {
  const u = { cause: "endpoint_not_granted", arg: "embedding/default" } as const;
  assert.equal(encodeUnavailable(u), "endpoint_not_granted:embedding/default");
  assert.deepEqual(decodeUnavailable(encodeUnavailable(u)), u);
});

test("按第一个冒号切,不是 split(':') —— 模型码里可以有冒号", () => {
  // `split(":")` 会把 `ns:model:v2` 切成三段并丢掉后两段,于是界面显示的模型名
  // 与库里锁的那个不是同一个,而人会照着显示的那个去 Atlas 上找。
  const decoded = decodeUnavailable("model_not_routable:ns:model:v2");
  assert.deepEqual(decoded, { cause: "model_not_routable", arg: "ns:model:v2" });
});

test("无参数的两档不写冒号,解回来 arg 是 null", () => {
  assert.equal(encodeUnavailable({ cause: "atlas_not_configured", arg: null }), "atlas_not_configured");
  assert.deepEqual(decodeUnavailable("atlas_not_configured"), { cause: "atlas_not_configured", arg: null });
});

test("有冒号但参数是空串,当作没有参数", () => {
  assert.deepEqual(decodeUnavailable("endpoint_not_granted:"), { cause: "endpoint_not_granted", arg: null });
});

// --- 认不出就认不出,不猜 ------------------------------------------------------

test("旧记录解不出来返回 null —— 不兜底成任何一档", () => {
  // 库里有改判之前写下的值:英文散文,以及 `capability_unavailable` 这种同义反复。
  // 把它们中的任何一条兜底成「端点未授权,请去平台授权」,会让人跑一趟去修一件
  // 没坏的事。含糊好过指错方向。
  assert.equal(decodeUnavailable("capability_unavailable"), null);
  assert.equal(decodeUnavailable("embedding capability (Atlas A1) is not yet available"), null);
  assert.equal(decodeUnavailable("atlas embed: NOT_ENTITLED: nope"), null);
});

test("空值也是 null,而不是抛", () => {
  assert.equal(decodeUnavailable(null), null);
  assert.equal(decodeUnavailable(undefined), null);
  assert.equal(decodeUnavailable(""), null);
});

test("前缀像但不是合法档次的,不算", () => {
  // `atlas_not_configured_yet` 与 `atlas_not_configured` 只差一个后缀。按前缀匹配
  // 会把它认成前者;这里要求整段相等。
  assert.equal(decodeUnavailable("atlas_not_configured_yet"), null);
});

// --- 错误上的原因 -------------------------------------------------------------

test("UnavailableError 带着结构化原因,而 message 仍是给日志的诊断串", () => {
  const e = new UnavailableError("atlas embed: NOT_ENTITLED: nope", {
    cause: "endpoint_not_granted",
    arg: "embedding/default",
  });
  assert.equal(e.unavailable.cause, "endpoint_not_granted");
  assert.equal(e.unavailable.arg, "embedding/default");
  // message 不被改写成码:诊断信息和给界面的码是两份东西,合并会同时损失两边。
  assert.match(e.message, /NOT_ENTITLED/);
  assert.ok(e instanceof Error, "既有的 instanceof 分类一处都不能失效");
});

test("unavailableReason 只对带原因的错误有话说", () => {
  const e = new UnavailableError("x", { cause: "workspace_not_provisioned", arg: null });
  assert.equal(unavailableReason(e), "workspace_not_provisioned");
  assert.equal(unavailableReason(new Error("plain")), null);
  assert.equal(unavailableReason("not an error"), null);
});
