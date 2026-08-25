import test from "node:test";
import assert from "node:assert/strict";
import { verificationFilterOf, topKOf } from "./params";
import { DEFAULT_SEARCH_PARAMS } from "./search";
import { VERIFICATION_FILTERS } from "../lib/state";

// These are not cosmetic helpers: verificationFilterOf decides WHICH QUALITY
// TIER a caller gets. Two identical copies already existed and ask-tool had no
// copy at all - so `karda.ask` accepted `verification_filter`, published it in
// its input list, and dropped it on the floor. That test is at the bottom.

test("every published filter value survives the coercion", () => {
  // If one did not, an agent asking for that tier would silently get another.
  for (const f of VERIFICATION_FILTERS) {
    assert.equal(verificationFilterOf(f), f);
  }
});

test("an unknown value falls back to the DEFAULT tier, not to `all`", () => {
  // Falling back to `all` would silently WIDEN what a caller sees on a typo -
  // the wrong direction to be wrong in for a quality filter.
  assert.equal(verificationFilterOf("verified"), DEFAULT_SEARCH_PARAMS.verificationFilter);
  assert.equal(verificationFilterOf(""), DEFAULT_SEARCH_PARAMS.verificationFilter);
  assert.equal(verificationFilterOf(undefined), DEFAULT_SEARCH_PARAMS.verificationFilter);
  assert.equal(verificationFilterOf(null), DEFAULT_SEARCH_PARAMS.verificationFilter);
  assert.equal(verificationFilterOf(3), DEFAULT_SEARCH_PARAMS.verificationFilter);
  assert.notEqual(DEFAULT_SEARCH_PARAMS.verificationFilter, "all", "the default must not itself be the widest tier");
});

test("top_k accepts a sane integer and rejects everything else", () => {
  assert.equal(topKOf(5), 5);
  assert.equal(topKOf(50), 50, "the cap itself is allowed");
  assert.equal(topKOf(51), DEFAULT_SEARCH_PARAMS.topK, "past the cap falls back rather than paging the corpus");
  assert.equal(topKOf(0), DEFAULT_SEARCH_PARAMS.topK);
  assert.equal(topKOf(-1), DEFAULT_SEARCH_PARAMS.topK);
  assert.equal(topKOf(2.5), DEFAULT_SEARCH_PARAMS.topK);
  assert.equal(topKOf("5"), DEFAULT_SEARCH_PARAMS.topK, "a string is a caller mistake, not a number");
});
