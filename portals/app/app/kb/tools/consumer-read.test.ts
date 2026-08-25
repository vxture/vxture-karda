import test from "node:test";
import assert from "node:assert/strict";
import { tallyConsumers, DIAGNOSIS_MIN_FAILURES, DIAGNOSIS_MIN_RATE_PCT, type ConsumerRow } from "./consumer-read";

const row = (over: Partial<ConsumerRow> = {}): ConsumerRow => ({
  consumerCode: "forge",
  channel: "direct",
  operation: "search",
  outcome: "ok",
  errorCode: null,
  latencyMs: 100,
  ...over,
});

const many = (n: number, over: Partial<ConsumerRow> = {}) => Array.from({ length: n }, () => row(over));

// --- the ranking rule ---------------------------------------------------------

test("diagnosis ranks by BLAST RADIUS, not by error rate", () => {
  // A consumer with 4 calls all failing is 100% broken and almost certainly
  // irrelevant; one with 400 calls and 12% failing is the actual incident.
  // Sorting by rate puts the noise on top, which is how an operator learns to
  // ignore the list.
  const rows = [
    ...many(4, { consumerCode: "tiny", outcome: "error", errorCode: "boom" }),
    ...many(48, { consumerCode: "big", outcome: "error", errorCode: "timeout" }),
    ...many(352, { consumerCode: "big" }),
  ];
  const r = tallyConsumers(rows);
  assert.deepEqual(r.diagnosis.map((d) => d.code), ["big", "tiny"]);
  assert.equal(r.diagnosis[0].failed, 48);
  assert.ok(r.diagnosis[1].errorRatePct > r.diagnosis[0].errorRatePct, "the noisier one really does have a higher RATE");
});

test("a handful of failures never reaches the diagnosis, whatever the rate", () => {
  const r = tallyConsumers(many(2, { outcome: "error", errorCode: "boom" }));
  assert.equal(r.consumers[0].errorRatePct, 100);
  assert.deepEqual(r.diagnosis, [], `under ${DIAGNOSIS_MIN_FAILURES} failures is noise, not an incident`);
});

test("a big consumer's normal error floor does not permanently occupy the list", () => {
  // 10 failures out of 5000 is 0.2% - real errors, but not something to page
  // anyone about, and it would otherwise sit at the top forever by count.
  const r = tallyConsumers([...many(10, { outcome: "error", errorCode: "flake" }), ...many(4990)]);
  assert.ok(r.consumers[0].errorRatePct < DIAGNOSIS_MIN_RATE_PCT);
  assert.deepEqual(r.diagnosis, []);
});

// --- grouping -----------------------------------------------------------------

test("the same agent on two channels is TWO integrations, not one", () => {
  // Merging them would hide a channel-specific outage behind a healthy average.
  const rows = [
    ...many(10, { channel: "direct" }),
    ...many(10, { channel: "runos", outcome: "error", errorCode: "gateway" }),
  ];
  const r = tallyConsumers(rows);
  assert.equal(r.consumers.length, 2);
  const runos = r.consumers.find((c) => c.channel === "runos");
  assert.equal(runos?.errorRatePct, 100);
  const direct = r.consumers.find((c) => c.channel === "direct");
  assert.equal(direct?.errorRatePct, 0, "the healthy channel must stay visibly healthy");
});

test("a null consumer_code is kept as its own row - it is karda's own surfaces", () => {
  // Not an agent. Folding it into an "unknown" bucket with real consumers would
  // attribute human traffic to an integration.
  const r = tallyConsumers([...many(3, { consumerCode: null }), ...many(3, { consumerCode: "forge" })]);
  assert.equal(r.consumers.length, 2);
  assert.ok(r.consumers.some((c) => c.code === null));
});

// --- the breakdown ------------------------------------------------------------

test("outcomes split three ways, and only `error` counts toward the rate", () => {
  // A degraded call SUCCEEDED - it answered, with rerank unavailable. Counting
  // it as an error would make every rerank outage look like a broken consumer.
  const r = tallyConsumers([
    ...many(6),
    ...many(3, { outcome: "degraded" }),
    ...many(1, { outcome: "error", errorCode: "x" }),
  ]);
  const c = r.consumers[0];
  assert.equal(c.ok, 6);
  assert.equal(c.degraded, 3);
  assert.equal(c.error, 1);
  assert.equal(c.errorRatePct, 10, "1 of 10, with degraded counted as served");
});

test("operations and error codes come back ranked, busiest first", () => {
  const r = tallyConsumers([
    ...many(5, { operation: "search" }),
    ...many(2, { operation: "ask" }),
    ...many(4, { operation: "write_document", outcome: "error", errorCode: "quota" }),
    ...many(1, { operation: "ask", outcome: "error", errorCode: "timeout" }),
  ]);
  const c = r.consumers[0];
  assert.deepEqual(c.operations.map((o) => o.operation), ["search", "write_document", "ask"]);
  assert.deepEqual(c.errorCodes.map((e) => e.code), ["quota", "timeout"]);
});

test("an error with no code does not invent one", () => {
  const r = tallyConsumers(many(4, { outcome: "error", errorCode: null }));
  assert.equal(r.consumers[0].error, 4);
  assert.deepEqual(r.consumers[0].errorCodes, []);
  assert.equal(r.diagnosis[0]?.topErrorCode, null, "no code is a real answer - do not guess");
});

test("ties break locale-free, so dev and server rank identically", () => {
  const r = tallyConsumers([...many(3, { operation: "乙操作" }), ...many(3, { operation: "甲操作" })]);
  const codeUnit = ["乙操作", "甲操作"].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  assert.deepEqual(r.consumers[0].operations.map((o) => o.operation), codeUnit);
});

test("consumers are listed busiest first", () => {
  const r = tallyConsumers([...many(2, { consumerCode: "small" }), ...many(9, { consumerCode: "large" })]);
  assert.deepEqual(r.consumers.map((c) => c.code), ["large", "small"]);
});

test("an empty ledger is an empty report, not a crash", () => {
  const r = tallyConsumers([]);
  assert.deepEqual(r.consumers, []);
  assert.deepEqual(r.diagnosis, []);
  assert.equal(r.capped, false);
});
