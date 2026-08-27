import test from "node:test";
import assert from "node:assert/strict";
import { NAV_ITEMS, activeNavKey } from "./nav";

test("a sub-view outside its domain's href prefix still activates that domain", () => {
  // /tools and /bench sit under 供给通道 but do not start with /channels.
  // Matching on the domain href alone would leave the nav showing NO active
  // domain on exactly the two pages batch 13 built for agent developers.
  assert.equal(activeNavKey("/tools"), "channels");
  assert.equal(activeNavKey("/bench"), "channels");
  assert.equal(activeNavKey("/channels"), "channels");
});

test("a sub-view under its own prefix still works", () => {
  assert.equal(activeNavKey("/evaluation/queue"), "evaluation");
  assert.equal(activeNavKey("/pipeline/tasks"), "pipeline");
});

test('"/" matches only exactly - every path would otherwise start with it', () => {
  assert.equal(activeNavKey("/"), "home");
});

test("an asset page activates 知识资产, not 首页 (KD-214 split them)", () => {
  // Before the split `/` WAS the asset overview, so `/assets/abc` deliberately
  // activated nothing - there was no asset domain entry to light up. Now there
  // is one, and a detail page belongs to it.
  assert.equal(activeNavKey("/assets"), "overview");
  assert.equal(activeNavKey("/assets/abc"), "overview");
  assert.equal(activeNavKey("/assets/new"), "overview");
});

test("an unknown path activates nothing rather than guessing", () => {
  assert.equal(activeNavKey("/nope"), null);
});

test("every sub-item href resolves back to its own domain", () => {
  // A sub-item pointing somewhere that activates a DIFFERENT domain would make
  // the nav highlight jump when the user follows it.
  for (const item of NAV_ITEMS) {
    for (const sv of item.sub ?? []) {
      assert.equal(activeNavKey(sv.href), item.key, `${sv.href} activates the wrong domain`);
    }
  }
});

test("every domain's own href activates itself", () => {
  for (const item of NAV_ITEMS) {
    assert.equal(activeNavKey(item.href), item.key);
  }
});
