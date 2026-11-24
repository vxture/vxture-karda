import { test } from "node:test";
import assert from "node:assert/strict";
import { projectNeighborhood, validateOntology } from "./projection";
import { CLOCK, KB, PRIVATE_KB, tenderSchema, tenderSnapshot } from "./tender-fixture";
import type { KnowledgeSnapshot, NeighborhoodQuery } from "./contracts";

const query: NeighborhoodQuery = { seedIds: ["project"], maxHops: 3, maxNodes: 50, maxEdges: 50 };
const read = (snapshot = tenderSnapshot(), patch: Partial<NeighborhoodQuery> = {}, visibleKbIds = new Set([KB])) =>
  projectNeighborhood(snapshot, tenderSchema, { visibleKbIds, now: CLOCK }, { ...query, ...patch });
const ids = (items: {id: string}[]) => items.map(i => i.id);

test("a project reaches the applicable qualification and supporting material, with exact source anchors", () => {
  const result = read();
  assert.deepEqual(ids(result.edges), ["r1", "r2", "r3"]);
  assert.deepEqual(ids(result.evidence), ["e1", "e2", "e3"]);
  assert.equal(result.evidence[0].documentVersion, 2);
  assert.equal(result.truncated, false);
});

test("unknown and inaccessible seeds have the same empty shape including counts", () => {
  assert.deepEqual(read(undefined, {seedIds: ["unknown"]}), read(undefined, {}, new Set()));
});

test("hidden library cannot bridge public entities or affect truncation", () => {
  const snapshot = tenderSnapshot();
  const expected = read(snapshot);
  snapshot.entities.push({id:"secret",kbId:PRIVATE_KB,type:"qualification",label:"hidden"});
  snapshot.relations.push({...snapshot.relations[1], id:"hidden-edge",kbId:PRIVATE_KB,targetId:"secret"});
  assert.deepEqual(read(snapshot), expected);
});

test("a cross-library edge is rejected even when both libraries are visible", () => {
  const snapshot = tenderSnapshot();
  snapshot.entities[2].kbId = PRIVATE_KB;
  assert.deepEqual(ids(read(snapshot, {}, new Set([KB, PRIVATE_KB])).edges), ["r1"]);
});

test("revoking a source removes its statements before any sweep and cannot bridge the graph", () => {
  const snapshot = tenderSnapshot();
  snapshot.sources.find(s => s.documentId === "tender" && s.current)!.withdrawn = true;
  assert.deepEqual(read(snapshot).edges, []);
  assert.deepEqual(read(snapshot).nodes, []);
});

test("multi-source support survives one withdrawal, but returns only surviving evidence IDs", () => {
  const snapshot = tenderSnapshot();
  snapshot.assertions[1].evidenceIds.push("e3");
  snapshot.sources.find(s => s.documentId === "tender" && s.current)!.withdrawn = true;
  const result = read(snapshot, {seedIds:["clause"]});
  assert.deepEqual(ids(result.edges), ["r2", "r3"]);
  assert.deepEqual(ids(result.evidence), ["e3"]);
  assert.deepEqual(result.assertions.find(a => a.id === "a2")!.evidenceIds, ["e3"]);
});

test("removing the last current support removes the relation", () => {
  const snapshot = tenderSnapshot();
  snapshot.assertions[1].evidenceIds = [];
  assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
});

test("old source versions do not become current evidence", () => {
  const snapshot = tenderSnapshot();
  snapshot.evidence[1].documentVersion = 1;
  assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
});

test("a contradictory edge alone never supports a conclusion", () => {
  const snapshot = tenderSnapshot();
  snapshot.evidence[1].stance = "contradicts";
  assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
});

test("superseded, draft and unverified assertions cannot enter the business graph", () => {
  for (const patch of [
    {supersededById: "a3"}, {contentState: "draft"}, {verificationState: "unverified"},
  ]) {
    const snapshot = tenderSnapshot();
    Object.assign(snapshot.assertions[1], patch);
    assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
  }
});

test("validUntil is exclusive, future and invalid validity windows fail closed", () => {
  for (const patch of [
    {validUntil: CLOCK}, {validFrom: "2026-11-25T00:00:00Z"}, {validFrom:"invalid"},
    {validFrom: CLOCK, validUntil: CLOCK},
  ]) {
    const snapshot = tenderSnapshot();
    Object.assign(snapshot.assertions[1], patch);
    assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
  }
  const snapshot = tenderSnapshot();
  snapshot.assertions[1].validFrom = CLOCK;
  assert.equal(read(snapshot).edges.length, 3);
});

test("expired human verification cannot remain usable while the stale-state sweep lags", () => {
  for (const verificationExpiresAt of [CLOCK, "2026-11-23T00:00:00Z", "bad"]) {
    const snapshot = tenderSnapshot();
    snapshot.assertions[1].verificationExpiresAt = verificationExpiresAt;
    assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
  }
  const snapshot = tenderSnapshot();
  snapshot.assertions[1].verificationExpiresAt = "2026-11-25T00:00:00Z";
  assert.equal(read(snapshot).edges.length, 3);
});

test("wrong endpoint types, unknown relation types and schema version drift cannot publish edges", () => {
  for (const mutate of [
    (s: KnowledgeSnapshot) => {s.entities[2].type = "project";},
    (s: KnowledgeSnapshot) => {s.relations[1].type = "similar_to";},
    (s: KnowledgeSnapshot) => {s.relations[1].schema.version = "2";},
  ]) {
    const snapshot = tenderSnapshot();
    mutate(snapshot);
    assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
  }
});

test("similarity suggestions and uncertified inference never act as business facts", () => {
  for (const origin of ["suggested", "inferred"] as const) {
    const snapshot = tenderSnapshot();
    snapshot.relations[1].origin = origin;
    assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
  }
});

test("invalid text anchors cannot be used as supporting evidence", () => {
  for (const patch of [{start:-1}, {end:1001}, {start:40,end:40}, {start:0.5}]) {
    const snapshot = tenderSnapshot();
    Object.assign(snapshot.evidence[1], patch);
    assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
  }
});

test("depth, type and output budgets constrain traversal with deterministic truncation", () => {
  assert.deepEqual(ids(read(undefined, {maxHops:1}).edges), ["r1"]);
  assert.deepEqual(ids(read(undefined, {maxHops:0}).nodes), ["project"]);
  assert.deepEqual(ids(read(undefined, {relationTypes:["has_clause"]}).edges), ["r1"]);
  const small = read(undefined, {maxNodes:2});
  assert.deepEqual(ids(small.edges), ["r1"]);
  assert.equal(small.truncated, true);
  assert.equal(read(undefined, {maxEdges:1}).truncated, true);
});

test("invalid budgets cannot accidentally request an unbounded query", () => {
  for (const patch of [
    {maxHops:Infinity}, {maxHops:-1}, {maxNodes:0}, {maxEdges:1001},
    {seedIds:[]}, {maxHops:1.5}, {seedIds:[""]},
  ]) assert.throws(() => read(undefined, patch), /invalid_graph_query/);
});

test("bad schema, duplicate identities and contradictory current source state fail closed", () => {
  assert.throws(() => validateOntology({...tenderSchema,entityTypes:["project","project"]}), /invalid_ontology/);
  assert.throws(() => validateOntology({...tenderSchema,relationTypes:[{
    id:"bad",sourceTypes:["unknown"],targetTypes:["project"],
  }]}), /invalid_ontology/);
  const snapshot = tenderSnapshot();
  snapshot.entities.push(snapshot.entities[0]);
  assert.throws(() => read(snapshot), /ambiguous_snapshot/);
  const bad = tenderSnapshot();
  bad.sources[0].current = true;
  assert.throws(() => read(bad), /ambiguous_source_version/);
});

test("snapshot order does not change the projection or mutate stored evidence", () => {
  const snapshot = tenderSnapshot();
  const expected = read(snapshot);
  const before = JSON.stringify(snapshot);
  expected.assertions[0].evidenceIds.push("fake");
  assert.equal(JSON.stringify(snapshot), before);
  const reordered = structuredClone(snapshot);
  for (const array of Object.values(reordered)) array.reverse();
  assert.deepEqual(read(reordered), read(snapshot));
});

test("evidence from another library and invalid server clocks are rejected", () => {
  const snapshot = tenderSnapshot();
  snapshot.evidence[1].kbId = PRIVATE_KB;
  assert.deepEqual(ids(read(snapshot).edges), ["r1"]);
  assert.throws(() => projectNeighborhood(snapshot, tenderSchema,
    {visibleKbIds:new Set([KB]),now:"bad"}, query), /invalid_read_clock/);
});

test("only contract fields leave the projection, not internal adapter metadata", () => {
  const snapshot = tenderSnapshot();
  for (const records of [snapshot.entities, snapshot.relations, snapshot.assertions, snapshot.evidence]) {
    Object.assign(records[0], {internalTenantCredential: "must-not-leave"});
  }
  Object.assign(snapshot.relations[0].schema, {privateConfig: "must-not-leave"});
  assert.equal(JSON.stringify(read(snapshot)).includes("must-not-leave"), false);
});
