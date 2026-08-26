import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildContext,
  clampRadius,
  snapOutward,
  contextNotFound,
  DEFAULT_RADIUS,
  MAX_RADIUS,
} from "./context-read";

const DOC = "doc-1";
const lines = (...ls: string[]) => ls.join("\n");

// --- the window ------------------------------------------------------------------

test("the window surrounds the citation and says where it sits inside", () => {
  const text = "0123456789ABCDEFGHIJ";
  const r = buildContext("c1", DOC, 1, text, { start: 10, end: 12 }, 3);
  assert.equal(r.status, "ok");
  assert.equal(r.window?.text, "789ABCDE");
  assert.equal(text.slice(10, 12), "AB");
  const w = r.window!;
  assert.equal(w.text.slice(w.citationStartInWindow, w.citationEndInWindow), "AB");
});

test("radius 0 returns the citation itself, snapped nowhere", () => {
  // The slack is a fraction of the radius on purpose: asking for no context
  // must not quietly expand to a whole line.
  const text = lines("aaa", "bbb", "ccc");
  const r = buildContext("c1", DOC, 1, text, { start: 5, end: 6 }, 0);
  assert.equal(r.window?.text, "b");
});

test("moreBefore / moreAfter distinguish a window edge from a document edge", () => {
  const text = "0123456789";
  const mid = buildContext("c1", DOC, 1, text, { start: 5, end: 6 }, 1);
  assert.equal(mid.window?.moreBefore, true);
  assert.equal(mid.window?.moreAfter, true);

  const whole = buildContext("c1", DOC, 1, text, { start: 5, end: 6 }, 100);
  assert.equal(whole.window?.moreBefore, false);
  assert.equal(whole.window?.moreAfter, false);
});

test("an out-of-range citation is REFUSED, not best-effort sliced", () => {
  // An end past the text means these are not the bytes the offsets were
  // measured against. A short slice would look like a real passage while being
  // an arbitrary one.
  const r = buildContext("c1", DOC, 1, "short", { start: 2, end: 900 }, 10);
  assert.equal(r.status, "source_mismatch");
  assert.equal(r.window, null);
  assert.equal(r.citationRange, null);
});

test("a reversed range is refused too", () => {
  assert.equal(buildContext("c1", DOC, 1, "0123456789", { start: 8, end: 3 }, 5).status, "source_mismatch");
});

// --- snapping --------------------------------------------------------------------

test("edges snap OUTWARD to complete the partial lines at both ends", () => {
  const text = lines("aaaa", "bbbb", "cccc");
  // A window that starts mid-"bbbb" and ends mid-"bbbb" grows to the whole line.
  assert.deepEqual(snapOutward(text, 6, 8, 10), { start: 5, end: 9 });
  assert.equal(text.slice(5, 9), "bbbb");
  // And one that begins inside "aaaa" and ends inside "cccc" grows to both ends.
  assert.deepEqual(snapOutward(text, 2, 11, 10), { start: 0, end: text.length });
});

test("the snap chases a boundary only within its slack, which is radius/4", () => {
  // Not a second free allowance on top of the radius. At radius 4 the slack is
  // 1 character, so a boundary 3 away is simply not chased - the window stays
  // where the radius put it.
  const text = lines("aaaa", "bbbb", "cccc");
  const r = buildContext("c1", DOC, 1, text, { start: 6, end: 7 }, 4);
  assert.equal(r.window?.text, lines("aa", "bbbb", "c"));
});

test("snapping cannot exceed its slack - a document with no newlines stays bounded", () => {
  // Otherwise one long line turns a bounded window into a whole-document read,
  // which is exactly what the unmetered anchor rule exists to prevent.
  const text = "x".repeat(5000);
  const r = buildContext("c1", DOC, 1, text, { start: 2500, end: 2501 }, 100);
  assert.ok(r.window!.text.length <= 1 + 2 * 100);
});

test("snapOutward leaves the edge alone when no boundary is within slack", () => {
  assert.deepEqual(snapOutward("abcdefghij", 3, 6, 2), { start: 3, end: 6 });
});

test("CJK text snaps by line, not by word", () => {
  // Word-snapping would work in English and silently do nothing here - and
  // Chinese is the corpus this platform actually serves.
  const text = lines("第一行内容", "第二行内容", "第三行内容");
  const snapped = snapOutward(text, 7, 9, 10);
  assert.equal(text.slice(snapped.start, snapped.end), "第二行内容");
});

// --- the radius ------------------------------------------------------------------

test("radius is clamped to the cap and floored at zero", () => {
  assert.equal(clampRadius(9_000_000), MAX_RADIUS);
  assert.equal(clampRadius(-5), 0);
  assert.equal(clampRadius(250), 250);
});

test("a missing or unparseable radius is the default, never an error", () => {
  // There is no reading of `radius: "banana"` that should cost the caller its
  // citation.
  assert.equal(clampRadius(undefined), DEFAULT_RADIUS);
  assert.equal(clampRadius("banana"), DEFAULT_RADIUS);
  assert.equal(clampRadius(null), DEFAULT_RADIUS);
  assert.equal(clampRadius("300"), 300);
});

// --- the empty answer ------------------------------------------------------------

test("not found and not visible answer identically", () => {
  assert.deepEqual(contextNotFound("c1"), {
    citationId: "c1",
    status: "source_unavailable",
    documentId: null,
    version: null,
    citationRange: null,
    window: null,
  });
});
