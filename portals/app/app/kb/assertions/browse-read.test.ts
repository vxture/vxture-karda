import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shapeAssertions,
  shapeEntities,
  encodeCursor,
  decodeCursor,
  clampPage,
  emptyPage,
  DEFAULT_PAGE,
  MAX_PAGE,
  type AssertionRow,
  type EntityRow,
} from "./browse-read";

const KB = "kb-1";

const a = (over: Partial<AssertionRow> = {}): AssertionRow => ({
  assertionId: "a1",
  kind: "fact",
  subject: "budget",
  statement: "budget is 3.8m",
  assertedBy: "Bid pack",
  asOf: "2026-03-01T00:00:00.000Z",
  verificationState: "unverified",
  supportingEvidenceCount: 1,
  contentState: "indexed",
  supersededById: null,
  createdAt: "2026-03-01T00:00:00.000Z",
  ...over,
});

const e = (over: Partial<EntityRow> = {}): EntityRow => ({
  entityId: "e1",
  name: "市应急管理局",
  kind: "thing",
  aliases: [],
  assertionCount: 3,
  createdAt: "2026-03-01T00:00:00.000Z",
  ...over,
});

// --- the cursor -------------------------------------------------------------------

test("a cursor round-trips", () => {
  const key = { createdAt: "2026-03-01T00:00:00.000Z", id: "a1" };
  assert.deepEqual(decodeCursor(encodeCursor(key)), key);
});

test("a malformed cursor means START OVER, never an error", () => {
  // Failing the call would turn a stale bookmark into something the agent has no
  // way to act on.
  for (const bad of ["", "not-base64!!", undefined, null, 42, encodeCursor({ createdAt: "nope", id: "x" })]) {
    assert.equal(decodeCursor(bad), null, JSON.stringify(bad));
  }
});

test("a cursor whose timestamp half is not a date is REJECTED, not half-believed", () => {
  // This is what stops a hand-built cursor. Ids here are uuids and cannot contain
  // the separator; anything that does splits into a left half that is not a
  // timestamp, and decode refuses it rather than paging from a position it
  // guessed. Refusing means "start over", which is always a safe answer.
  assert.equal(decodeCursor(encodeCursor({ createdAt: "2026-03-01T00:00:00.000Z", id: "weird|id" })), null);
  assert.equal(decodeCursor(Buffer.from("|a1", "utf-8").toString("base64url")), null);
  assert.equal(decodeCursor(Buffer.from("2026-03-01T00:00:00.000Z|", "utf-8").toString("base64url")), null);
});

test("page size is clamped, and unreadable input is the default", () => {
  assert.equal(clampPage(9_000_000), MAX_PAGE);
  assert.equal(clampPage(0), 1);
  assert.equal(clampPage("banana"), DEFAULT_PAGE);
  assert.equal(clampPage(undefined), DEFAULT_PAGE);
  assert.equal(clampPage(30), 30);
});

// --- what browse refuses to show --------------------------------------------------

test("an ungrounded assertion is not browsable either", () => {
  // Browse is the tool most likely to be argued into an exception. It is not one:
  // the Console is where a steward audits drafts, with a session and an identity.
  const r = shapeAssertions(KB, [a({ supportingEvidenceCount: 0 })], 10);
  assert.deepEqual(r.items, []);
});

test("a DRAFT assertion is not browsable - so a just-extracted library browses EMPTY", () => {
  // Stated rather than discovered: extraction lands assertions as draft, so an
  // empty page does not imply an empty library.
  const r = shapeAssertions(KB, [a({ contentState: "draft" })], 10);
  assert.deepEqual(r.items, []);
});

test("an adjudication LOSER is not browsable", () => {
  const r = shapeAssertions(KB, [a({ supersededById: "winner" })], 10);
  assert.deepEqual(r.items, []);
});

test("an entity nothing recallable mentions is dropped", () => {
  // The registry keeps such entities on purpose; listing them here would answer
  // "what does this library know about" with a name it knows nothing about.
  const r = shapeEntities(KB, [e({ assertionCount: 0 }), e({ entityId: "e2" })], 10);
  assert.deepEqual(r.items.map((x) => x.entityId), ["e2"]);
});

test("internal filter fields never reach the caller", () => {
  const keys = Object.keys(shapeAssertions(KB, [a()], 10).items[0]);
  for (const hidden of ["contentState", "supersededById", "createdAt"]) {
    assert.ok(!keys.includes(hidden), hidden);
  }
});

// --- paging -----------------------------------------------------------------------

test("a full page yields a cursor; a short page does not", () => {
  const rows = Array.from({ length: 4 }, (_, i) => a({ assertionId: `a${i}`, createdAt: `2026-03-0${i + 1}T00:00:00.000Z` }));
  assert.ok(shapeAssertions(KB, rows, 3).nextCursor, "4 fetched for a page of 3 -> more exists");
  assert.equal(shapeAssertions(KB, rows.slice(0, 3), 3).nextCursor, null, "exactly 3 -> the end");
});

test("the page never returns more than pageSize items", () => {
  const rows = Array.from({ length: 6 }, (_, i) => a({ assertionId: `a${i}` }));
  assert.equal(shapeAssertions(KB, rows, 3).items.length, 3);
});

test("THE CURSOR TRACKS THE LAST FETCHED ROW, NOT THE LAST SURVIVING ONE", () => {
  // If it tracked the last survivor, every row the filter dropped after it would
  // be re-fetched and re-dropped forever, and a library whose tail is all drafts
  // would page without ever terminating.
  const rows = [
    a({ assertionId: "keep", createdAt: "2026-03-01T00:00:00.000Z" }),
    a({ assertionId: "dropped", contentState: "draft", createdAt: "2026-03-02T00:00:00.000Z" }),
    a({ assertionId: "overflow", createdAt: "2026-03-03T00:00:00.000Z" }),
  ];
  const r = shapeAssertions(KB, rows, 2);
  assert.deepEqual(r.items.map((x) => x.assertionId), ["keep"]);
  assert.deepEqual(decodeCursor(r.nextCursor)?.id, "dropped", "cursor must point past the DROPPED row");
});

test("a page whose every row is filtered out still advances", () => {
  // The pathological case of the rule above: no items, but a cursor, so the
  // caller can reach the rows beyond the drafts.
  const rows = Array.from({ length: 3 }, (_, i) =>
    a({ assertionId: `d${i}`, contentState: "draft", createdAt: `2026-03-0${i + 1}T00:00:00.000Z` }),
  );
  const r = shapeAssertions(KB, rows, 2);
  assert.deepEqual(r.items, []);
  assert.ok(r.nextCursor, "no items must NOT mean end-of-list");
});

test("the envelope names the library and the target it was asked for", () => {
  const r = shapeEntities(KB, [e()], 10);
  assert.equal(r.kbId, KB);
  assert.equal(r.target, "entities");
  assert.equal(shapeAssertions(KB, [a()], 10).target, "assertions");
});

test("not visible and empty answer identically", () => {
  assert.deepEqual(emptyPage(KB, "assertions"), { kbId: KB, target: "assertions", items: [], nextCursor: null });
  assert.deepEqual(shapeAssertions(KB, [], 10), { kbId: KB, target: "assertions", items: [], nextCursor: null });
});
