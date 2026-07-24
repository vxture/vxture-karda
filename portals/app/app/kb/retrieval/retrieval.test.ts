import { test } from "node:test";
import assert from "node:assert/strict";
import { rrfFuse, toRanked, RRF_K } from "./rrf";
import { resolveScope, VisibleSetCache, type ScopedKb } from "./scope";
import {
  runSearch,
  UnavailableReranker,
  type Recaller,
  type Reranker,
  type RecallHit,
} from "./search";

// --- RRF ---------------------------------------------------------------------

test("RRF ranks an item present in both lists above one in a single list", () => {
  const both = rrfFuse([toRanked(["a", "b"]), toRanked(["a", "c"])]);
  assert.equal(both[0].id, "a", "a is in both, should win");
});

test("RRF over a single list preserves that list's order", () => {
  // The 6a reality: no vector list yet, so fusion runs over BM25 alone and must
  // reduce to it.
  const fused = rrfFuse([toRanked(["x", "y", "z"])]);
  assert.deepEqual(fused.map((f) => f.id), ["x", "y", "z"]);
});

test("RRF is deterministic on ties (breaks by id)", () => {
  const a = rrfFuse([toRanked(["p", "q"])]);
  const b = rrfFuse([toRanked(["p", "q"])]);
  assert.deepEqual(a, b);
  assert.ok(a[0].score === 1 / (RRF_K + 0));
});

// --- scope resolution: the security floor ------------------------------------

const org = (id: string): ScopedKb => ({ kbId: id, namespace: "org" });
const plat = (id: string): ScopedKb => ({ kbId: id, namespace: "platform" });

test("whitelist is attachment intersected with visibility", () => {
  const r = resolveScope({
    visibleSet: [org("a"), org("b")],
    attached: ["a", "b", "c"], // c is attached but not visible
  });
  assert.deepEqual(r.whitelist.map((k) => k.kbId).sort(), ["a", "b"]);
});

test("kb_ids can only narrow; an unseen id is ignored and echoed", () => {
  const r = resolveScope({
    visibleSet: [org("a"), org("b")],
    attached: ["a", "b"],
    kbIds: ["a", "zzz"], // zzz is not visible - cannot be granted by asking
  });
  assert.deepEqual(r.whitelist.map((k) => k.kbId), ["a"]);
  assert.deepEqual(r.ignoredKbIds, ["zzz"]);
});

test("a preset kb joins by id but still must be visible", () => {
  const visible = resolveScope({
    visibleSet: [plat("preset1")],
    attached: [],
    presetKbIds: ["preset1"],
  });
  assert.deepEqual(visible.whitelist.map((k) => k.kbId), ["preset1"]);

  const invisible = resolveScope({
    visibleSet: [], // preset not visible
    attached: [],
    presetKbIds: ["preset1"],
  });
  assert.deepEqual(invisible.whitelist, []);
});

test("namespaces are derived from the resolved whitelist", () => {
  const r = resolveScope({ visibleSet: [org("a"), plat("p")], attached: ["a", "p"] });
  assert.deepEqual(r.namespaces.sort(), ["org", "platform"]);
});

// --- visible-set cache -------------------------------------------------------

test("cache returns a value within TTL and expires after", () => {
  const c = new VisibleSetCache(1000);
  const key = { org: "o", ws: "w", product: "karda", user: "u" };
  c.set(key, [org("a")], 0);
  assert.deepEqual(c.get(key, 500)?.map((k) => k.kbId), ["a"]);
  assert.equal(c.get(key, 1000), null, "expired at TTL");
});

test("explicit invalidation evicts before TTL - revocation is immediate", () => {
  const c = new VisibleSetCache(300000);
  const key = { org: "o", ws: "w", product: "karda", user: "u" };
  c.set(key, [org("a")], 0);
  c.invalidate(key);
  assert.equal(c.get(key, 1), null);
});

test("workspace-wide invalidation clears every user's entry in that workspace", () => {
  const c = new VisibleSetCache(300000);
  c.set({ org: "o", ws: "w", product: "karda", user: "u1" }, [org("a")], 0);
  c.set({ org: "o", ws: "w", product: "karda", user: "u2" }, [org("b")], 0);
  c.set({ org: "o", ws: "OTHER", product: "karda", user: "u3" }, [org("c")], 0);
  c.invalidateWorkspace("o", "w");
  assert.equal(c.get({ org: "o", ws: "w", product: "karda", user: "u1" }, 1), null);
  assert.equal(c.get({ org: "o", ws: "w", product: "karda", user: "u2" }, 1), null);
  assert.ok(c.get({ org: "o", ws: "OTHER", product: "karda", user: "u3" }, 1), "other ws untouched");
});

// --- search chain ------------------------------------------------------------

const bm25 = (hits: Record<string, RecallHit[]>): Recaller => ({
  async recall(q) {
    return hits[q.namespace] ?? [];
  },
});
const fakeReranker = (): Reranker => ({
  async rerank(_q, cands) {
    // reverse the pool order so we can tell rerank ran vs the RRF fallback
    return cands.map((c, i) => ({ id: c.id, score: cands.length - i }));
  },
});

const scopeOf = (kbs: ScopedKb[], ignored: string[] = []) => ({
  whitelist: kbs,
  namespaces: [...new Set(kbs.map((k) => k.namespace))],
  ignoredKbIds: ignored,
});

test("an empty scope returns nothing, not an error", async () => {
  const r = await runSearch({
    query: "q",
    scope: scopeOf([]),
    recallers: [bm25({})],
    reranker: fakeReranker(),
  });
  assert.deepEqual(r.items, []);
  assert.equal(r.partial, false);
});

test("a recall hit outside the whitelist never reaches the output", async () => {
  // A recaller that misbehaves and returns a kb the caller cannot see must be
  // filtered - the whitelist is enforced at the recall boundary, not trusted.
  const leaky = bm25({ org: [{ id: "h1", kbId: "allowed" }, { id: "h2", kbId: "FORBIDDEN" }] });
  const r = await runSearch({
    query: "q",
    scope: scopeOf([org("allowed")]),
    recallers: [leaky],
    reranker: fakeReranker(),
  });
  const kbs = r.items.map((i) => i.kbId);
  assert.ok(!kbs.includes("FORBIDDEN"), "a forbidden kb must not leak through recall");
  assert.ok(kbs.includes("allowed"));
});

test("rerank runs when available and orders the output", async () => {
  const r = await runSearch({
    query: "q",
    scope: scopeOf([org("k")]),
    recallers: [bm25({ org: [{ id: "a", kbId: "k" }, { id: "b", kbId: "k" }] })],
    reranker: fakeReranker(),
  });
  assert.equal(r.degraded, null);
  assert.equal(r.items.length, 2);
});

test("rerank unavailable degrades to RRF order, still whitelisted", async () => {
  // The Atlas A3 reality: the stub reranker throws, so search must degrade -
  // return RRF-ordered results tagged degraded, and STILL only whitelisted kbs.
  const leaky = bm25({ org: [{ id: "a", kbId: "k" }, { id: "x", kbId: "FORBIDDEN" }] });
  const r = await runSearch({
    query: "q",
    scope: scopeOf([org("k")]),
    recallers: [leaky],
    reranker: new UnavailableReranker(),
  });
  assert.equal(r.degraded, "rerank_unavailable");
  assert.deepEqual(r.items.map((i) => i.kbId), ["k"], "degrade path keeps the whitelist");
});

test("a namespace failure yields partial, others still return", async () => {
  const failingOrg: Recaller = {
    async recall(q) {
      if (q.namespace === "org") throw new Error("namespace timeout");
      return [{ id: "p1", kbId: "pk" }];
    },
  };
  const r = await runSearch({
    query: "q",
    scope: scopeOf([org("ok"), { kbId: "pk", namespace: "platform" }]),
    recallers: [failingOrg],
    reranker: fakeReranker(),
  });
  assert.equal(r.partial, true);
  assert.ok(r.items.some((i) => i.kbId === "pk"), "the healthy namespace still returns");
});

test("ignored kb_ids are carried through to the result", async () => {
  const r = await runSearch({
    query: "q",
    scope: scopeOf([org("k")], ["ghost"]),
    recallers: [bm25({ org: [{ id: "a", kbId: "k" }] })],
    reranker: fakeReranker(),
  });
  assert.deepEqual(r.ignoredKbIds, ["ghost"]);
});
