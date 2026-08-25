import test from "node:test";
import assert from "node:assert/strict";
import { normalise, p95, tallySupply, type SupplyRow } from "./supply-read";

const NOW = Date.UTC(2026, 7, 25, 12, 0, 0);
const HOUR = 3_600_000;

function row(over: Partial<SupplyRow> = {}): SupplyRow {
  return {
    channel: "direct",
    capability: "karda.kb-read",
    operation: "search",
    consumerCode: "forge",
    outcome: "ok",
    latencyMs: 100,
    createdAt: new Date(NOW - HOUR),
    assets: [],
    ...over,
  };
}

test("p95 by nearest rank, and an empty sample is 0 not NaN", () => {
  assert.equal(p95([]), 0);
  assert.equal(p95([10]), 10);
  // 20 values 1..20 -> rank ceil(0.95*20) = 19
  assert.equal(
    p95(Array.from({ length: 20 }, (_, i) => i + 1)),
    19,
  );
});

test("normalise leaves an all-zero series alone instead of dividing by zero", () => {
  assert.deepEqual(normalise([0, 0, 0]), [0, 0, 0]);
  assert.deepEqual(normalise([1, 2, 4]), [25, 50, 100]);
});

test("today is the trailing 24h, not since-midnight", () => {
  // A midnight boundary makes the 00:05 reading look like an outage; this page
  // is an operations view.
  const t = tallySupply([row({ createdAt: new Date(NOW - 23 * HOUR) }), row({ createdAt: new Date(NOW - 25 * HOUR) })], NOW);
  assert.equal(t.totals.todayCalls, 1);
});

test("delta compares today against the previous 24h", () => {
  const rows = [
    ...Array.from({ length: 12 }, () => row({ createdAt: new Date(NOW - 2 * HOUR) })),
    ...Array.from({ length: 10 }, () => row({ createdAt: new Date(NOW - 30 * HOUR) })),
  ];
  const t = tallySupply(rows, NOW);
  assert.equal(t.totals.todayCalls, 12);
  assert.equal(t.totals.deltaPct, 20);
});

test("no yesterday is NOT +100% - a product's first day is not a surge", () => {
  const t = tallySupply([row(), row()], NOW);
  assert.equal(t.totals.deltaPct, 0);
});

test("channels split, and each carries its own p95 and error rate", () => {
  const rows = [
    row({ channel: "direct", latencyMs: 100 }),
    row({ channel: "direct", latencyMs: 300, outcome: "error" }),
    row({ channel: "runos", latencyMs: 50 }),
  ];
  const t = tallySupply(rows, NOW);
  assert.equal(t.totals.directCalls, 2);
  assert.equal(t.totals.runosCalls, 1);
  assert.equal(t.byChannel.direct.errorRatePct, 50);
  assert.equal(t.byChannel.runos.errorRatePct, 0);
  assert.equal(t.byChannel.runos.p95Ms, 50);
});

test("error rate keeps one decimal - 0.4% must not round to a healthy 0%", () => {
  const rows = [
    ...Array.from({ length: 249 }, () => row()),
    row({ outcome: "error" }),
  ];
  const t = tallySupply(rows, NOW);
  assert.equal(t.byChannel.direct.errorRatePct, 0.4);
});

test("degraded counts as served, not as an error", () => {
  const t = tallySupply([row({ outcome: "degraded" }), row({ outcome: "ok" })], NOW);
  assert.equal(t.byChannel.direct.errorRatePct, 0);
  assert.equal(t.totals.todayCalls, 2);
});

test("a channel with no traffic reports zeros, not absent keys", () => {
  const t = tallySupply([row({ channel: "direct" })], NOW);
  assert.deepEqual(t.byChannel.runos, { todayCalls: 0, p95Ms: 0, errorRatePct: 0, spark: new Array(24).fill(0) });
});

test("consumers rank by calls, carry a share, and name the library they cited most", () => {
  const rows = [
    row({ consumerCode: "forge", assets: [{ kbId: "kb-a", citedCount: 3 }] }),
    row({ consumerCode: "forge", assets: [{ kbId: "kb-b", citedCount: 1 }] }),
    row({ consumerCode: "scribe", assets: [{ kbId: "kb-b", citedCount: 2 }] }),
  ];
  const t = tallySupply(rows, NOW);
  assert.equal(t.consumers[0].code, "forge");
  assert.equal(t.consumers[0].calls, 2);
  assert.equal(t.consumers[0].sharePct, 67);
  assert.equal(t.consumers[0].topAssetKbId, "kb-a");
  assert.equal(t.consumers[1].topAssetKbId, "kb-b");
});

test("a Console call has no consumer code and is not counted as an agent", () => {
  const t = tallySupply([row({ consumerCode: null }), row({ consumerCode: "forge" })], NOW);
  assert.equal(t.totals.todayCalls, 2);
  assert.deepEqual(
    t.consumers.map((c) => c.code),
    ["forge"],
  );
  assert.equal(t.consumers[0].sharePct, 100);
});

test("a consumer's `via` is the channel it actually used most", () => {
  const rows = [
    row({ consumerCode: "raven", channel: "runos" }),
    row({ consumerCode: "raven", channel: "runos" }),
    row({ consumerCode: "raven", channel: "direct" }),
  ];
  assert.equal(tallySupply(rows, NOW).consumers[0].via, "runos");
});

test("capability totals group both channels together", () => {
  const rows = [
    row({ capability: "karda.kb-read", channel: "direct" }),
    row({ capability: "karda.kb-read", channel: "runos" }),
    row({ capability: "karda.kb-write" }),
  ];
  const t = tallySupply(rows, NOW);
  assert.equal(t.capabilityCalls["karda.kb-read"], 2);
  assert.equal(t.capabilityCalls["karda.kb-write"], 1);
});

test("the sparkline is 24 hourly buckets, oldest first, with today's traffic last", () => {
  const t = tallySupply([row({ createdAt: new Date(NOW - 30 * 60_000) })], NOW);
  assert.equal(t.byChannel.direct.spark.length, 24);
  assert.equal(t.byChannel.direct.spark[23], 100);
  assert.equal(t.byChannel.direct.spark[0], 0);
});

test("an empty ledger produces a complete, zeroed payload - never undefined", () => {
  const t = tallySupply([], NOW);
  assert.equal(t.totals.todayCalls, 0);
  assert.equal(t.totals.p95Ms, 0);
  assert.equal(t.totals.deltaPct, 0);
  assert.deepEqual(t.consumers, []);
  assert.deepEqual(t.capabilityCalls, {});
  assert.equal(t.capped, false);
});

// --- per-asset heat ---------------------------------------------------------

import { tallyHeat, type HeatRow } from "./supply-read";

const DAY = 86_400_000;
const heatRow = (over: Partial<HeatRow> = {}): HeatRow => ({
  kbId: "kb-a",
  citedCount: 1,
  consumerCode: "forge",
  createdAt: new Date(NOW - DAY),
  ...over,
});

test("heat sums CITATIONS, not calls - two citations in one call count twice", () => {
  const m = tallyHeat([heatRow({ citedCount: 3 }), heatRow({ citedCount: 2 })], NOW);
  assert.equal(m.get("kb-a")?.heat7d, 5);
});

test("a library outside the 7-day window contributes nothing", () => {
  const m = tallyHeat([heatRow({ createdAt: new Date(NOW - 8 * DAY) })], NOW);
  assert.equal(m.get("kb-a"), undefined);
});

test("top consumers rank by citations and cap at three", () => {
  const rows = [
    heatRow({ consumerCode: "forge", citedCount: 5 }),
    heatRow({ consumerCode: "scribe", citedCount: 9 }),
    heatRow({ consumerCode: "anlan", citedCount: 1 }),
    heatRow({ consumerCode: "raven", citedCount: 7 }),
  ];
  assert.deepEqual(tallyHeat(rows, NOW).get("kb-a")?.topConsumers, ["scribe", "raven", "forge"]);
});

test("a Console citation has no consumer and does not become an empty code", () => {
  const m = tallyHeat([heatRow({ consumerCode: null, citedCount: 4 })], NOW);
  assert.equal(m.get("kb-a")?.heat7d, 4);
  assert.deepEqual(m.get("kb-a")?.topConsumers, []);
});

test("the sparkline is one bucket per day, oldest first, newest last", () => {
  const m = tallyHeat([heatRow({ createdAt: new Date(NOW - 60_000), citedCount: 2 })], NOW);
  const spark = m.get("kb-a")!.sparkline;
  assert.equal(spark.length, 7);
  assert.equal(spark[6], 100);
  assert.equal(spark[0], 0);
});

test("libraries are kept apart", () => {
  const m = tallyHeat([heatRow({ kbId: "kb-a" }), heatRow({ kbId: "kb-b", citedCount: 9 })], NOW);
  assert.equal(m.get("kb-a")?.heat7d, 1);
  assert.equal(m.get("kb-b")?.heat7d, 9);
});
