import test from "node:test";
import assert from "node:assert/strict";
import { tallyCorpus, COVERAGE_FLOOR_PCT, type KbRef, type VerifCount } from "./corpus-read";

const KBS: KbRef[] = [
  { id: "a", name: "投标知识库" },
  { id: "b", name: "应急预案库" },
];

const row = (kbId: string, verificationState: string, count: number): VerifCount => ({
  kbId,
  verificationState,
  count,
});

test("counts documents and entries into one population per kb", () => {
  const r = tallyCorpus(KBS, [
    row("a", "verified", 80),
    row("a", "stale", 10),
    row("a", "unverified", 10),
    row("b", "verified", 30),
    row("b", "unverified", 70),
  ]);
  assert.equal(r.verified, 110);
  assert.equal(r.stale, 10);
  assert.equal(r.unverified, 80);
  // 110 / 200
  assert.equal(r.coveragePct, 55);
});

test("the three buckets always sum to the population - unverified is the remainder", () => {
  const r = tallyCorpus(KBS, [row("a", "verified", 7), row("a", "stale", 3), row("a", "unverified", 5)]);
  assert.equal(r.verified + r.stale + r.unverified, 15);
});

test("belowFloor lists only assets under the floor, worst first, with their stale count", () => {
  const r = tallyCorpus(
    KBS,
    [
      row("a", "verified", 90), // 90% - above
      row("a", "unverified", 10),
      row("b", "verified", 60), // 60% - below
      row("b", "stale", 15),
      row("b", "unverified", 25),
    ],
    80,
  );
  assert.deepEqual(r.belowFloor, [{ name: "应急预案库", coveragePct: 60, staleCount: 15 }]);
  assert.equal(r.floorPct, 80);
});

test("an EMPTY asset is not 0% - it is excluded, or every new library tops the list", () => {
  const r = tallyCorpus(KBS, [row("a", "verified", 50), row("a", "unverified", 50)], 80);
  // b has no rows at all
  assert.deepEqual(
    r.belowFloor.map((x) => x.name),
    ["投标知识库"],
  );
});

test("rows under an unknown kb are ignored, not counted into the totals", () => {
  const r = tallyCorpus(KBS, [row("a", "verified", 10), row("deleted-kb", "verified", 999)]);
  assert.equal(r.verified, 10);
  assert.equal(r.coveragePct, 100);
});

test("an empty corpus reports 0%, not NaN", () => {
  const r = tallyCorpus(KBS, []);
  assert.equal(r.coveragePct, 0);
  assert.equal(r.verified, 0);
  assert.deepEqual(r.belowFloor, []);
});

test("belowFloor is capped and ties break by name so the list is deterministic", () => {
  const kbs: KbRef[] = [
    { id: "1", name: "乙" },
    { id: "2", name: "甲" },
    { id: "3", name: "丙" },
  ];
  const rows = kbs.flatMap((k) => [row(k.id, "verified", 1), row(k.id, "unverified", 9)]);
  const r = tallyCorpus(kbs, rows, 80, 2);
  assert.equal(r.belowFloor.length, 2);
  // all three sit at 10%; the tie-break is by name, so the result is stable
  assert.deepEqual(
    r.belowFloor.map((x) => x.name),
    ["丙", "甲"],
  );
});

test("the default floor is the one the demo overlay's classification implies", () => {
  // The demo listed 61% / 58% / 71% as below floor and 84%+ as fine, so the
  // floor has to sit in (71, 84]. If this constant drifts out of that band the
  // live path stops agreeing with the overlay it replaced.
  assert.ok(COVERAGE_FLOOR_PCT > 71 && COVERAGE_FLOOR_PCT <= 84);
});
