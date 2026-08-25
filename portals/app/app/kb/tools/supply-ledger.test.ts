import test from "node:test";
import assert from "node:assert/strict";
import {
  capabilityOf,
  citationsOf,
  classifyOutcome,
  operationOf,
  supplyEventFor,
  taskIdRefOf,
} from "./supply-ledger";
import type { CallerContext } from "./s2s";

const caller: CallerContext = {
  callerProduct: "forge",
  org: "org-1",
  workspace: "ws-1",
  user: "usr-1",
  mode: "obo",
};

test("operation drops the product prefix so both channels group together", () => {
  // The Runos channel sends bare snake_case operations; the direct channel sends
  // karda.<tool>. Storing them differently would split one capability's traffic
  // into two rows that never add up.
  assert.equal(operationOf("karda.search"), "search");
  assert.equal(operationOf("search"), "search");
});

test("capability is recorded on BOTH channels, so the two are comparable", () => {
  assert.equal(capabilityOf("search"), "karda.kb-read");
  assert.equal(capabilityOf("ask"), "karda.kb-read");
  assert.equal(capabilityOf("write_document"), "karda.kb-write");
  assert.equal(capabilityOf("create_entry"), "karda.kb-write");
});

test("an unmapped operation gets a marker, not a crash and not a silent ''", () => {
  assert.equal(capabilityOf("teleport"), "karda.unknown");
});

test("a 4xx/5xx records the body's error code", () => {
  assert.deepEqual(classifyOutcome({ status: 403, body: { error: "access_denied" } }), {
    outcome: "error",
    errorCode: "access_denied",
  });
  assert.deepEqual(classifyOutcome({ status: 500, body: {} }), { outcome: "error", errorCode: "http_500" });
});

test("degraded is a 200 that the chain flagged - NOT folded into ok", () => {
  // This is the whole point of the third value: the channel answered, but not
  // fully. Folding it into ok hides exactly what the 供给通道 page is for.
  assert.equal(classifyOutcome({ status: 200, body: { result: { degraded: true } } }).outcome, "degraded");
  assert.equal(classifyOutcome({ status: 200, body: { result: { partial: true } } }).outcome, "degraded");
  assert.equal(classifyOutcome({ status: 200, body: { result: { degraded: false } } }).outcome, "ok");
  assert.equal(classifyOutcome({ status: 200, body: { result: {} } }).outcome, "ok");
});

test("citations aggregate per library and skip malformed rows", () => {
  const res = {
    status: 200,
    body: {
      result: {
        citations: [
          { id: "c1", kbId: "kb-a" },
          { id: "c2", kbId: "kb-a" },
          { id: "c3", kbId: "kb-b" },
          { id: "c4" }, // no kbId - not attributable, skipped rather than guessed
          { id: "c5", kbId: 42 },
        ],
      },
    },
  };
  assert.deepEqual(citationsOf(res).sort((a, b) => a.kbId.localeCompare(b.kbId)), [
    { kbId: "kb-a", citedCount: 2 },
    { kbId: "kb-b", citedCount: 1 },
  ]);
});

test("no citations means no attribution rows at all, not a zero row", () => {
  assert.deepEqual(citationsOf({ status: 200, body: { result: { citations: [] } } }), []);
  assert.deepEqual(citationsOf({ status: 200, body: {} }), []);
});

test("task_id is clamped to the column width, not rejected", () => {
  assert.equal(taskIdRefOf({ task_id: "t-1" }), "t-1");
  assert.equal(taskIdRefOf({ task_id: "x".repeat(300) })?.length, 128);
  assert.equal(taskIdRefOf({ task_id: "   " }), null);
  assert.equal(taskIdRefOf({ task_id: 7 }), null);
  assert.equal(taskIdRefOf({}), null);
});

test("a call with NO workspace produces no event - never a fabricated tenant", () => {
  const event = supplyEventFor({
    channel: "direct",
    toolName: "karda.search",
    args: {},
    caller: { ...caller, workspace: null },
    result: { status: 400, body: { error: "no_workspace" } },
    latencyMs: 3,
  });
  assert.equal(event, null);
});

test("a served call becomes a complete event", () => {
  const event = supplyEventFor({
    channel: "runos",
    toolName: "karda.search",
    args: { task_id: "agent-task-9" },
    caller: { ...caller, callerProduct: "runos" },
    result: { status: 200, body: { result: { citations: [{ kbId: "kb-a" }] } } },
    latencyMs: 41.6,
  });
  assert.deepEqual(event, {
    channel: "runos",
    capability: "karda.kb-read",
    operation: "search",
    consumerCode: "runos",
    workspaceId: "ws-1",
    taskIdRef: "agent-task-9",
    outcome: "ok",
    errorCode: null,
    latencyMs: 42,
    assets: [{ kbId: "kb-a", citedCount: 1 }],
  });
});

test("an errored call records no citations even if the body carries some", () => {
  // A failed call did not serve knowledge; crediting libraries for it would
  // inflate their heat with calls that never reached a consumer.
  const event = supplyEventFor({
    channel: "direct",
    toolName: "karda.ask",
    args: {},
    caller,
    result: { status: 500, body: { error: "boom", result: { citations: [{ kbId: "kb-a" }] } } },
    latencyMs: 5,
  });
  assert.deepEqual(event?.assets, []);
  assert.equal(event?.outcome, "error");
});

test("latency is never negative and never fractional", () => {
  const event = supplyEventFor({
    channel: "direct",
    toolName: "karda.list_kbs",
    args: {},
    caller,
    result: { status: 200, body: {} },
    latencyMs: -0.4,
  });
  assert.equal(event?.latencyMs, 0);
});
