import test from "node:test";
import assert from "node:assert/strict";
import {compareAuditReleases,verifyAuditWindow,type AuditRelease} from "./audit-history";

function release(generation:number):AuditRelease{
  return {id:`release-${generation}`,generation,createdAt:"2026-11-25T00:00:00Z",createdBy:"owner",compileRunId:"compile",fingerprint:"f".repeat(64),
    verified:true,issues:[],relations:[{id:"relation",kbId:"kb",sourceId:"a",targetId:"b",type:"requires",origin:"asserted",assertionIds:["proof"],schema:{namespace:"test",schemaId:"test",version:"1"}}],
    sources:[{kbId:"kb",documentId:"source",version:1,contentHash:"a".repeat(64)}],reviewCount:1};
}
test("audit comparison identifies immutable relation and source changes without mutating either version",()=>{
  const a=release(1),b=release(2);b.relations[0].targetId="c";b.sources[0].version=2;
  b.relations.push({...b.relations[0],id:"new"});a.relations.push({...a.relations[0],id:"removed"});
  const original=JSON.stringify([a,b]),diff=compareAuditReleases(a,b);
  assert.deepEqual(diff.added,["new"]);assert.deepEqual(diff.removed,["removed"]);assert.deepEqual(diff.changed,["relation"]);
  assert.equal(diff.sourceChanges[0].before?.version,1);assert.equal(diff.sourceChanges[0].after?.version,2);
  assert.equal(JSON.stringify([a,b]),original);
  assert.throws(()=>compareAuditReleases({...a,verified:false},b),/semantic_invalid_comparison/);
  assert.throws(()=>compareAuditReleases(b,a),/semantic_invalid_comparison/);
});
test("audit replay distinguishes complete chain, bounded windows, gaps, corruption and bad current pointers",()=>{
  assert.equal(verifyAuditWindow([release(3),release(2),release(1)],true,true),"complete");
  assert.equal(verifyAuditWindow([release(3),release(2)],true,false),"window");
  assert.equal(verifyAuditWindow([release(3),release(1)],true,true),"failed");
  assert.equal(verifyAuditWindow([release(2)],true,true),"failed");
  assert.equal(verifyAuditWindow([{...release(1),verified:false}],true,true),"failed");
  assert.equal(verifyAuditWindow([release(1)],false,true),"failed");
  assert.equal(verifyAuditWindow([],true,true),"complete");
});
