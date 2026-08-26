import { test } from "node:test";
import assert from "node:assert/strict";
import { shapeEntities, noEntityMatch, type EntityCandidateRow } from "./entity-read";

const a = (over: Partial<EntityCandidateRow["assertions"][number]> = {}) => ({
  assertionId: "a1",
  kind: "fact",
  statement: "budget is 3.8m",
  assertedBy: "Bid pack 2026",
  asOf: "2026-03-01T00:00:00.000Z",
  validUntil: null,
  verificationState: "unverified",
  supersededBy: null,
  role: "mentions",
  contentState: "indexed",
  supportingEvidenceCount: 1,
  ...over,
});

const row = (over: Partial<EntityCandidateRow> = {}): EntityCandidateRow => ({
  entityId: "e1",
  kbId: "kb-1",
  name: "XX无人机项目",
  kind: "thing",
  aliases: ["Drone Project"],
  assertions: [a()],
  ...over,
});

// --- matching -------------------------------------------------------------------

test("an exact name match is reported as exact", () => {
  const r = shapeEntities("XX无人机项目", [row()]);
  assert.equal(r.match, "exact");
  assert.equal(r.entities[0].match, "exact");
});

test("an alias matches exactly too, case-insensitively", () => {
  const r = shapeEntities("drone project", [row()]);
  assert.equal(r.match, "exact");
});

test("a near miss is reported as PARTIAL, never as a hit", () => {
  // An agent that asked about 应急管理局 and got XX应急管理局 has to know the
  // registry did not hold what it asked for. A near miss reading as a
  // confirmation is the worst way for a knowledge tool to be wrong.
  const r = shapeEntities("无人机", [row()]);
  assert.equal(r.match, "partial");
  assert.equal(r.entities[0].match, "partial");
});

test("an exact match wins outright - partials are dropped, not ranked below", () => {
  // A ranked mixture would put the agent in the position of deciding which of
  // OUR matches to trust. That is our job.
  const r = shapeEntities("XX无人机项目", [
    row(),
    row({ entityId: "e2", name: "XX无人机项目备件", aliases: [] }),
  ]);
  assert.deepEqual(r.entities.map((e) => e.entityId), ["e1"]);
});

test("the same name in two libraries returns BOTH", () => {
  // Entities are per-library by design. Two libraries knowing about one thing -
  // and possibly disagreeing - is a fact the agent needs, not a duplicate to
  // collapse.
  const r = shapeEntities("XX无人机项目", [row(), row({ entityId: "e2", kbId: "kb-2" })]);
  assert.deepEqual(r.entities.map((e) => e.kbId), ["kb-1", "kb-2"]);
});

// --- what comes back about it ----------------------------------------------------

test("assertions are ordered newest first, undated last", () => {
  // The question is "what do we know about this thing" and its natural axis is
  // time. Sorting by verification would bury a fresh fact under a stale
  // verified one, which is backwards for an agent acting on current information.
  const r = shapeEntities("XX无人机项目", [
    row({
      assertions: [
        a({ assertionId: "undated", asOf: null }),
        a({ assertionId: "old", asOf: "2025-01-01T00:00:00.000Z" }),
        a({ assertionId: "new", asOf: "2026-06-01T00:00:00.000Z", verificationState: "unverified" }),
      ],
    }),
  ]);
  assert.deepEqual(r.entities[0].assertions.map((x) => x.assertionId), ["new", "old", "undated"]);
});

test("an assertion with no supporting evidence is not served here either", () => {
  // This tool must not become the back door that serves what retrieval refuses.
  const r = shapeEntities("XX无人机项目", [row({ assertions: [a({ supportingEvidenceCount: 0 })] })]);
  assert.deepEqual(r.entities[0].assertions, []);
});

test("a non-indexed assertion is not served", () => {
  const r = shapeEntities("XX无人机项目", [row({ assertions: [a({ contentState: "draft" })] })]);
  assert.deepEqual(r.entities[0].assertions, []);
});

test("a SUPERSEDED assertion IS shown, labelled with what replaced it", () => {
  // Different from retrieval on purpose. "We used to believe X, now Y" is
  // information; hiding it lets an agent re-derive the old value from an older
  // citation without ever learning it had been replaced.
  const r = shapeEntities("XX无人机项目", [row({ assertions: [a({ supersededBy: "winner" })] })]);
  assert.equal(r.entities[0].assertions.length, 1);
  assert.equal(r.entities[0].assertions[0].supersededBy, "winner");
});

test("the internal filter fields never reach the caller", () => {
  const r = shapeEntities("XX无人机项目", [row()]);
  const keys = Object.keys(r.entities[0].assertions[0]);
  assert.ok(!keys.includes("contentState"));
  assert.ok(!keys.includes("supportingEvidenceCount"));
});

// --- the empty answer ------------------------------------------------------------

test("no match and not-visible answer IDENTICALLY", () => {
  // Otherwise one call per guess maps the entity registries of libraries the
  // caller has no access to.
  assert.deepEqual(noEntityMatch("q"), { query: "q", match: null, entities: [] });
  assert.deepEqual(shapeEntities("q", []), { query: "q", match: null, entities: [] });
});
