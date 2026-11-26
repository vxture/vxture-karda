import test from "node:test";
import assert from "node:assert/strict";
import {publicationImpact} from "./publication-impact";
import type {PublishedRelationInput} from "./read-postgres";
const relation=(id:string):PublishedRelationInput["relations"][number]=>({id,kbId:"kb",sourceId:"a",targetId:"b",type:"requires",origin:"asserted",assertionIds:["z","a"],schema:{namespace:"local",schemaId:"test",version:"1"}});
const source=(documentId:string,version=1)=>({kbId:"kb",documentId,version,contentHash:"a".repeat(64)});
test("publication impact explains added/removed/changed structure and source versions without historical body or hashes",()=>{
  const before={relations:[relation("removed"),relation("changed"),relation("stable")],sources:[source("removed"),source("changed"),source("stable")]};
  const after={relations:[relation("added"),{...relation("changed"),targetId:"new"},{...relation("stable"),assertionIds:["a","z"]}],sources:[source("added"),{...source("changed",2),contentHash:"b".repeat(64)},source("stable")]};
  const original=JSON.stringify([before,after]),result=publicationImpact(before,after);
  assert.deepEqual(result.relations.map(r=>[r.id,r.kind]),[["added","added"],["changed","changed"],["removed","removed"]]);
  assert.equal(result.relations[1].before?.targetId,"b");assert.equal(result.relations[1].after?.targetId,"new");
  assert.deepEqual(result.sources[1],{id:"changed",kind:"changed",beforeVersion:1,afterVersion:2,contentChanged:true});
  assert.equal(JSON.stringify(result).includes("contentHash"),false);assert.equal(JSON.stringify(result).includes("kbId"),false);
  assert.equal(JSON.stringify([before,after]),original);assert.deepEqual(publicationImpact(after,after).relations,[]);
  assert.equal(publicationImpact({relations:[],sources:[]},after).relations.every(r=>r.kind==="added"),true);
});
test("publication impact budgets refuse partial impact while equal-version changed content is still shown",()=>{
  const empty={relations:[],sources:[]};
  const impact=publicationImpact({relations:[],sources:[source("doc")]},{relations:[],sources:[{...source("doc"),contentHash:"b".repeat(64)}]});
  assert.equal(impact.sources[0].contentChanged,true);assert.equal(impact.sources[0].afterVersion,1);
  assert.throws(()=>publicationImpact(empty,{relations:Array.from({length:5001},(_,i)=>relation(String(i))),sources:[]}),/semantic_preview_budget/);
  assert.throws(()=>publicationImpact(empty,{relations:[],sources:Array.from({length:101},(_,i)=>source(String(i)))}),/semantic_preview_budget/);
  assert.throws(()=>publicationImpact(empty,{relations:[{...relation("oversized"),type:"x".repeat(2*1024*1024)}],sources:[]}),/semantic_preview_budget/);
});
