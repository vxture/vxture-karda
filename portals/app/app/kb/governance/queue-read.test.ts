import test from "node:test";
import assert from "node:assert/strict";
import { buildQueue, QUEUE_LIMIT } from "./queue-read";
import type { GovernancePolicy } from "../lib/state";

const KB_A = { id: "kb-a", name: "作业规程" };
const KB_B = { id: "kb-b", name: "行业标准" };

const ON: GovernancePolicy = { enabled: true, exemptSyncedContent: false, intervalDays: 90 };
const ON_EXEMPT: GovernancePolicy = { enabled: true, exemptSyncedContent: true, intervalDays: 90 };
const OFF: GovernancePolicy = { enabled: false, exemptSyncedContent: true };

function policies(...pairs: [string, GovernancePolicy][]) {
  return new Map(pairs);
}

let seq = 0;
function row(over: Partial<Parameters<typeof buildQueue>[2][number]> = {}) {
  seq += 1;
  return {
    kind: "document" as const,
    id: `d${seq}`,
    kbId: KB_A.id,
    title: `doc ${seq}`,
    verificationState: "unverified",
    verifier: null,
    verifiedAt: null,
    expiresAt: null,
    source: "upload" as string | null,
    ...over,
  };
}

// --- rule 1: stale leads, longest-lapsed first --------------------------------

test("stale items lead unverified ones, whatever the input order", () => {
  // A stale item is a REGRESSION - it was trusted and silently dropped out of
  // the default recall tier. An unverified item never broke anything.
  const q = buildQueue(
    [KB_A],
    policies([KB_A.id, ON]),
    [
      row({ id: "u1", title: "a-unverified", verificationState: "unverified" }),
      row({ id: "s1", title: "z-stale", verificationState: "stale", expiresAt: new Date("2026-08-01") }),
    ],
  );
  assert.deepEqual(q.items.map((i) => i.id), ["s1", "u1"]);
});

test("within stale, the longest-lapsed comes first", () => {
  const q = buildQueue(
    [KB_A],
    policies([KB_A.id, ON]),
    [
      row({ id: "recent", verificationState: "stale", expiresAt: new Date("2026-08-20") }),
      row({ id: "ancient", verificationState: "stale", expiresAt: new Date("2026-01-05") }),
      row({ id: "middle", verificationState: "stale", expiresAt: new Date("2026-05-10") }),
    ],
  );
  assert.deepEqual(q.items.map((i) => i.id), ["ancient", "middle", "recent"]);
});

// --- rule 2: only rows the verify button will accept --------------------------

test("a library with governance OFF contributes nothing", () => {
  // GovernanceService refuses these with `governance_off`. Listing them would
  // put a button in front of the operator that is guaranteed to fail.
  const q = buildQueue(
    [KB_A, KB_B],
    policies([KB_A.id, OFF], [KB_B.id, ON]),
    [row({ kbId: KB_A.id, id: "off" }), row({ kbId: KB_B.id, id: "on" })],
  );
  assert.deepEqual(q.items.map((i) => i.id), ["on"]);
});

test("connector-synced documents are dropped only where the library exempts them", () => {
  // Same predicate the service enforces on write (governanceApplies), not a
  // second copy that can drift.
  const exempt = buildQueue(
    [KB_A],
    policies([KB_A.id, ON_EXEMPT]),
    [row({ id: "synced", source: "connector" }), row({ id: "uploaded", source: "upload" })],
  );
  assert.deepEqual(exempt.items.map((i) => i.id), ["uploaded"]);

  const notExempt = buildQueue(
    [KB_A],
    policies([KB_A.id, ON]),
    [row({ id: "synced", source: "connector" }), row({ id: "uploaded", source: "upload" })],
  );
  assert.deepEqual(notExempt.items.map((i) => i.id).sort(), ["synced", "uploaded"]);
});

test("entries are never treated as synced, so an exempting library still queues them", () => {
  // Entries are authored in-product; `source: null` is a fact about entries, not
  // a missing column. Dropping them under exemptSyncedContent would silently
  // hide authored knowledge from its own governance queue.
  const q = buildQueue(
    [KB_A],
    policies([KB_A.id, ON_EXEMPT]),
    [row({ kind: "entry", id: "e1", source: null })],
  );
  assert.deepEqual(q.items.map((i) => i.id), ["e1"]);
});

// --- population -----------------------------------------------------------

test("rows under a library outside the population are dropped, not counted", () => {
  // A kb from another workspace, or one soft-deleted since the query - its rows
  // must not leak into someone else's queue OR inflate their totals.
  const q = buildQueue([KB_A], policies([KB_A.id, ON]), [row({ kbId: "kb-other", id: "leak" }), row({ id: "mine" })]);
  assert.deepEqual(q.items.map((i) => i.id), ["mine"]);
  assert.equal(q.staleTotal + q.unverifiedTotal, 1);
});

test("already-verified rows are not work - they never enter the queue", () => {
  const q = buildQueue([KB_A], policies([KB_A.id, ON]), [row({ id: "v", verificationState: "verified" })]);
  assert.deepEqual(q.items, []);
});

test("each item carries its library name - the operator works across libraries", () => {
  const q = buildQueue(
    [KB_A, KB_B],
    policies([KB_A.id, ON], [KB_B.id, ON]),
    [row({ kbId: KB_B.id, id: "b1" })],
  );
  assert.equal(q.items[0].kbName, "行业标准");
});

// --- totals and truncation ----------------------------------------------------

test("totals describe the WHOLE eligible queue, not the returned page", () => {
  // "12 items from done" vs "1,200" changes what the operator does next, so the
  // totals must not silently become the page size.
  const rows = Array.from({ length: 8 }, (_, i) =>
    row({ id: `s${i}`, verificationState: "stale", expiresAt: new Date(2026, 0, i + 1) }),
  ).concat(Array.from({ length: 5 }, (_, i) => row({ id: `u${i}` })));

  const q = buildQueue([KB_A], policies([KB_A.id, ON]), rows, 3);
  assert.equal(q.items.length, 3);
  assert.equal(q.staleTotal, 8);
  assert.equal(q.unverifiedTotal, 5);
  assert.equal(q.truncated, true);
});

test("truncated is false when the page holds everything", () => {
  const q = buildQueue([KB_A], policies([KB_A.id, ON]), [row(), row()], 10);
  assert.equal(q.truncated, false);
});

test("ineligible rows do not count toward the totals either", () => {
  // The count and the list must agree, or the page says "3 remaining" over an
  // empty queue and the operator can never finish.
  const q = buildQueue(
    [KB_A],
    policies([KB_A.id, ON_EXEMPT]),
    [row({ source: "connector" }), row({ source: "connector" }), row({ source: "upload" })],
  );
  assert.equal(q.items.length, 1);
  assert.equal(q.staleTotal + q.unverifiedTotal, 1);
});

// --- determinism --------------------------------------------------------------

test("ordering is LOCALE-FREE - the same list on a dev box and on the server", () => {
  // localeCompare orders CJK by whatever ICU collation the runtime carries; it
  // put 甲 before 乙 on Windows and after it on the Linux CI runner. Code-unit
  // comparison is the same everywhere.
  const q = buildQueue(
    [KB_A],
    policies([KB_A.id, ON]),
    [row({ id: "b", title: "乙方合同" }), row({ id: "a", title: "甲方合同" })],
  );
  const codeUnitOrder = ["乙方合同", "甲方合同"].sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  assert.deepEqual(q.items.map((i) => i.title), codeUnitOrder);
});

test("two items sharing a title still get a stable order", () => {
  const q = buildQueue(
    [KB_A],
    policies([KB_A.id, ON]),
    [row({ id: "zz", title: "同名" }), row({ id: "aa", title: "同名" })],
  );
  assert.deepEqual(q.items.map((i) => i.id), ["aa", "zz"]);
});

test("an untitled entry sorts LAST in its group, not first", () => {
  // An empty-string fallback would float untitled rows to the top of the
  // backlog, which is the least useful place for the least identifiable item.
  const q = buildQueue(
    [KB_A],
    policies([KB_A.id, ON]),
    [row({ kind: "entry", id: "none", title: null, source: null }), row({ id: "named", title: "aaa" })],
  );
  assert.deepEqual(q.items.map((i) => i.id), ["named", "none"]);
  assert.equal(q.items[1].title, null, "the null must survive - the UI shows a placeholder, we do not invent one");
});

test("the default page size is a working page, not a report", () => {
  assert.equal(QUEUE_LIMIT, 50);
});
