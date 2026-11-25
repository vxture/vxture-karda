import { test } from "node:test";
import assert from "node:assert/strict";
import { projectNeighborhood, projectDirectory, validateOntology } from "./projection";
import { CLOCK, KB, PRIVATE_KB, tenderSchema, tenderSnapshot } from "./tender-fixture";
import type { KnowledgeSnapshot, NeighborhoodQuery } from "./contracts";
import {encodeDirectoryCursor} from "./directory-cursor";

test("directory pages traverse a stable eligible projection without gaps or hidden-budget effects",()=>{
  const snapshot=tenderSnapshot(),scope={visibleKbIds:new Set([KB]),now:CLOCK};
  const limits={maxNodes:2,maxEdges:1,pageCursor:""};
  const first=projectDirectory(snapshot,tenderSchema,scope,limits),seen=[...first.edges.map(e=>e.id)];
  let cursor=first.directoryPage!.nextCursor;
  while(cursor){const next=projectDirectory(snapshot,tenderSchema,scope,{...limits,pageCursor:cursor});seen.push(...next.edges.map(e=>e.id));cursor=next.directoryPage!.nextCursor;}
  assert.deepEqual(seen,["r1","r2","r3"]);
  const hidden=tenderSnapshot();hidden.relations.push({...hidden.relations[0],id:"hidden",kbId:PRIVATE_KB});
  hidden.entities.push({id:"hidden",kbId:PRIVATE_KB,type:"project",label:"private"});
  assert.deepEqual(projectDirectory(hidden,tenderSchema,scope,limits),first);
  assert.deepEqual(projectDirectory({...snapshot,relations:[...snapshot.relations].reverse(),evidence:[...snapshot.evidence].reverse()},tenderSchema,scope,limits),first);
  assert.throws(()=>read(snapshot,{pageCursor:""}),/invalid_graph_query/);
  for(const pageCursor of ["bad",encodeDirectoryCursor("0".repeat(64),"r1")])
    assert.throws(()=>projectDirectory(snapshot,tenderSchema,scope,{...limits,pageCursor}),/invalid_graph_query|semantic_directory_changed/);
  const token=first.directoryPage!.nextCursor!;
  for(const changed of [(()=>{const s=tenderSnapshot();s.entities[0].label="renamed";return s;})(),
    (()=>{const s=tenderSnapshot();s.assertions[0].statement="amended";return s;})(),
    (()=>{const s=tenderSnapshot();s.sources.find(s=>s.current)!.withdrawn=true;return s;})()])
    assert.throws(()=>projectDirectory(changed,tenderSchema,scope,{...limits,pageCursor:token}),/semantic_directory_changed/);
  assert.throws(()=>projectDirectory(snapshot,tenderSchema,{...scope,visibleKbIds:new Set()}, {...limits,pageCursor:token}),/semantic_directory_changed/);
  assert.throws(()=>projectDirectory(snapshot,tenderSchema,scope,{...limits,maxEdges:2,pageCursor:token}),/semantic_directory_changed/);
  const end=projectDirectory(snapshot,tenderSchema,scope,{maxNodes:50,maxEdges:50,pageCursor:""});
  assert.equal(end.directoryPage!.nextCursor,null);
});

const query: NeighborhoodQuery = { seedIds: ["project"], maxHops: 3, maxNodes: 50, maxEdges: 50 };
const read = (snapshot = tenderSnapshot(), patch: Partial<NeighborhoodQuery> = {}, visibleKbIds = new Set([KB])) =>
  projectNeighborhood(snapshot, tenderSchema, { visibleKbIds, now: CLOCK }, { ...query, ...patch });
const ids = (items: {id: string}[]) => items.map(i => i.id);

test("directory fingerprint stays bounded when 5000 relations share an assertion with 5000 proofs",()=>{
  const snapshot=tenderSnapshot(),edge=snapshot.relations[0],proof=snapshot.evidence[0],assertion=snapshot.assertions.find(a=>a.id===edge.assertionIds[0])!;
  snapshot.evidence=Array.from({length:5000},(_,i)=>({...proof,id:`proof-${i}`}));
  snapshot.assertions=[{...assertion,evidenceIds:snapshot.evidence.map(e=>e.id)}];
  snapshot.relations=Array.from({length:5000},(_,i)=>({...edge,id:`relation-${String(i).padStart(4,"0")}`}));
  const start=performance.now(),result=projectDirectory(snapshot,tenderSchema,{visibleKbIds:new Set([KB]),now:CLOCK},{maxNodes:2,maxEdges:1,pageCursor:""});
  assert.equal(result.edges.length,1);assert.equal(result.evidence.length,5000);assert.ok(result.directoryPage?.nextCursor);
  assert.ok(performance.now()-start<2000,"shared proofs must not be expanded once per relation for hashing");
});

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

test("directory covers disjoint authorized components beyond the old 200-edge and 50-seed sampling",()=>{
  const snapshot=tenderSnapshot();
  snapshot.entities=[];snapshot.relations=[];
  for(let i=0;i<250;i++){
    const id=String(i).padStart(3,"0");
    snapshot.entities.push({id:`p${id}`,kbId:KB,type:"project",label:`P${id}`},{id:`c${id}`,kbId:KB,type:"clause",label:`C${id}`});
    snapshot.relations.push({id:`r${id}`,kbId:KB,schema:tenderSchema,type:"has_clause",sourceId:`p${id}`,targetId:`c${id}`,assertionIds:["a1"],origin:"asserted"});
  }
  const scope={visibleKbIds:new Set([KB]),now:CLOCK},limits={maxNodes:500,maxEdges:1000};
  const result=projectDirectory(snapshot,tenderSchema,scope,limits);
  assert.equal(result.nodes.length,500);assert.equal(result.edges.length,250);assert.equal(result.truncated,false);
  assert.deepEqual(ids(result.evidence),["e1"]);
  assert.deepEqual(projectDirectory({...snapshot,entities:[...snapshot.entities].reverse(),relations:[...snapshot.relations].reverse()},tenderSchema,scope,limits),result);
  const small=projectDirectory(snapshot,tenderSchema,scope,{maxNodes:5,maxEdges:1000});
  assert.equal(small.nodes.length,4);assert.equal(small.edges.length,2);assert.equal(small.truncated,true);
  assert.equal(projectDirectory(snapshot,tenderSchema,scope,{maxNodes:500,maxEdges:1}).edges.length,1);
});

test("directory eligibility precedes selection, budgets and truncation",()=>{
  const snapshot=tenderSnapshot(),scope={visibleKbIds:new Set([KB]),now:CLOCK},limits={maxNodes:4,maxEdges:3};
  const expected=projectDirectory(snapshot,tenderSchema,scope,limits);
  for(let i=0;i<250;i++)snapshot.relations.push({...snapshot.relations[0],id:`a-hidden-${i}`,kbId:PRIVATE_KB});
  snapshot.relations.push({...snapshot.relations[0],id:"a-inferred",origin:"inferred"});
  assert.deepEqual(projectDirectory(snapshot,tenderSchema,scope,limits),expected);
  assert.equal(expected.truncated,false);
  assert.deepEqual(ids(projectDirectory(snapshot,tenderSchema,scope,{...limits,relationTypes:["requires"]}).edges),["r2"]);
  snapshot.sources.filter(s=>s.current).forEach(s=>{s.withdrawn=true;});
  const empty=projectDirectory(snapshot,tenderSchema,scope,limits);
  assert.equal(empty.nodes.length,0);assert.equal(empty.edges.length,0);assert.equal(empty.truncated,false);
  assert.throws(()=>projectDirectory(snapshot,tenderSchema,scope,{maxNodes:501,maxEdges:1000}),/invalid_graph_query/);
});
