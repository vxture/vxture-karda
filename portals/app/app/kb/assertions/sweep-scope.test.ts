import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sweepUngrounded } from "./store";

// `sweepUngrounded` needs a Postgres for anything it actually tombstones, so the
// behaviour here is the one rule that can be checked without one - and it is the
// rule worth checking, because getting it wrong tombstones another tenant's
// assertions rather than merely doing nothing.

test("an EMPTY scope sweeps nothing - it never degrades to a global sweep", async () => {
  // The asymmetry that motivates the type: sweeping nothing when you meant
  // everything is a no-op you notice on the next tick; sweeping everything when
  // you meant one workspace is not recoverable.
  assert.deepEqual(await sweepUngrounded([]), { scanned: 0, tombstoned: 0 });
});

test("`all` is spelled out, so a global sweep cannot happen by omission", () => {
  // A signature taking `kbIds?: string[]` would make "everything" the meaning of
  // a forgotten argument. Read from the source because the guarantee is in the
  // TYPE, and a type cannot be asserted at runtime.
  const src = readFileSync("app/kb/assertions/store.ts", "utf8");
  assert.match(src, /export type SweepScope = string\[\] \| "all";/);
  assert.match(src, /sweepUngrounded\(scope: SweepScope\)/, "scope must be required, never optional");
});

test("the governance sweep passes the workspace's OWN scope, never `all`", () => {
  // The user-triggered path already had this rule for the stale sweep; the
  // ungrounded sweep rides the same endpoint and has to inherit it, or one
  // tenant pressing a button tombstones every other tenant's assertions.
  const route = readFileSync("app/api/kb/governance/sweep/route.ts", "utf8");
  const userHalf = route.slice(route.indexOf("const auth = await requireAuth()"));
  assert.match(userHalf, /sweepUngrounded\(scope\)/);
  assert.doesNotMatch(userHalf, /sweepUngrounded\("all"\)/);
});
