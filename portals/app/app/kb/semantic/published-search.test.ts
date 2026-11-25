import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {projectPublishedSearch} from "./projection";
import {parsePublishedSearch} from "./published-search";
import {publishedSearchTool} from "./published-search-tool";
import {dispatchTool} from "../tools/dispatch";
import {CLOCK,KB,PRIVATE_KB,tenderSchema,tenderSnapshot} from "./tender-fixture";
import type {CallerContext} from "../tools/s2s";

const scope={visibleKbIds:new Set([KB]),now:CLOCK};
const statements=new Map([["a1","Project has a clause"],["a2","Certification required"],["a3","Certificate supports qualification"]]);
const excerpts=new Map([["e1","Project passage"],["e2","ISO9001 approval proof"],["e3","Certificate validity"]]);
const search=(query:string,topK=20,snapshot=tenderSnapshot(),types?:string[])=>projectPublishedSearch(snapshot,tenderSchema,scope,{query,topK},statements,excerpts,types);

test("published search spans eligible facts before topK and retains exact linked evidence",()=>{
  const result=search("ISO9001");assert.deepEqual(result.search?.items.map(r=>r.relationId),["r2"]);
  assert.deepEqual(result.edges.map(e=>e.id),["r2"]);assert.deepEqual(result.evidence.map(e=>e.id),["e2"]);
  assert.deepEqual(result.assertions.map(a=>a.id),["a2"]);assert.equal(result.evidence[0].start,30);assert.equal(result.evidence[0].end,90);
  assert.equal(search("Certification").edges[0].id,"r2");assert.equal(search("requires").edges[0].id,"r2");
  assert.deepEqual(search("unmatched").edges,[]);assert.equal(search("ISO9001",20,tenderSnapshot(),["has_clause"]).search?.matchedRelations,0);
  const top=search("Project Certificate",1);assert.equal(top.edges.length,1);assert.ok(top.search!.matchedRelations>1);assert.equal(top.truncated,true);
  const reordered=tenderSnapshot();reordered.relations.reverse();reordered.entities.reverse();
  assert.deepEqual(search("clause",20,reordered),search("clause"));
});

test("hidden, stale, expired, unreviewed and inferred content cannot affect ranking or totals",()=>{
  const clean=search("ISO9001"),snapshot=tenderSnapshot();
  snapshot.relations.push({...snapshot.relations[1],id:"hidden",kbId:PRIVATE_KB});
  snapshot.assertions.push({...snapshot.assertions[0],id:"private",kbId:PRIVATE_KB});
  assert.deepEqual(search("ISO9001",20,snapshot),clean);
  for(const patch of [()=>{const s=tenderSnapshot();s.sources.find(s=>s.current)!.withdrawn=true;return s;},
    ()=>{const s=tenderSnapshot();s.assertions[1].verificationExpiresAt=CLOCK;return s;},
    ()=>{const s=tenderSnapshot();s.assertions[1].contentState="draft";return s;},
    ()=>{const s=tenderSnapshot();s.relations[1].origin="inferred";return s;},
    ()=>{const s=tenderSnapshot();s.evidence[1].stance="contradicts";return s;}])assert.equal(search("ISO9001",20,patch()).edges.length,0);
  assert.deepEqual(projectPublishedSearch(snapshot,tenderSchema,{...scope,visibleKbIds:new Set()}, {query:"ISO9001",topK:20},statements,excerpts).search,{eligibleRelations:0,matchedRelations:0,items:[]});
});

test("published search validates bounded explicit scope and refuses oversized ranking documents",()=>{
  const value={kb_ids:[randomUUID()],query:"ISO9001"};assert.equal(parsePublishedSearch(value).topK,10);
  for(const patch of [{kb_ids:[]},{kb_ids:Array.from({length:21},()=>randomUUID())},{query:" "},{query:"x".repeat(501)},{top_k:21},{top_k:0},{entity_ids:[]},{identity:{}},{relation_types:[1]}])assert.throws(()=>parsePublishedSearch({...value,...patch}),/published_search_invalid_request/);
  assert.throws(()=>projectPublishedSearch(tenderSnapshot(),tenderSchema,scope,{query:"ISO",topK:20},statements,new Map([["e2","x".repeat(65537)]])),/published_search_budget/);
});

test("published search OBO dispatch meters after success and never delivers on metering failure",async()=>{
  const caller:CallerContext={mode:"obo",callerProduct:"runos",org:randomUUID(),workspace:randomUUID(),user:"usr_test",productAccess:{roles:["member"],permissions:["product.enter","data.read","ai.use"]}};
  const args={kb_ids:[randomUUID()],query:"ISO"};let reads=0,meters=0;
  const backend:typeof publishedSearchTool=async(who,input)=>publishedSearchTool(who,input,async(identity,query,admit)=>{
    reads++;assert.equal(identity.productCode,"runos");assert.equal(await admit(),true);assert.equal(query.query,"ISO");return {format:"karda.published-search.v1",mode:"published_facts",knowledge:{...search("ISO"),format:"karda.knowledge-package.v1",sourceStatus:"complete",statements:[],passages:[],gaps:[]}};
  },async()=>{meters++;});
  assert.equal((await dispatchTool("karda.published_search",args,caller,{listKbs:async()=>[],publishedSearch:backend})).status,200);assert.equal(reads,1);assert.equal(meters,1);
  assert.equal((await backend({...caller,mode:"service",user:null},args)).status,403);assert.equal((await backend({...caller,productAccess:undefined},args)).status,403);assert.equal(reads,1);
  const noDelivery=await publishedSearchTool(caller,args,async()=>{throw Error("private SQL");},async()=>{meters++;});assert.equal(noDelivery.status,503);assert.equal(noDelivery.body.error,"published_search_unavailable");assert.equal(meters,1);
  const result=await publishedSearchTool(caller,args,async()=>({format:"karda.published-search.v1",mode:"published_facts",knowledge:{...search("ISO"),format:"karda.knowledge-package.v1",sourceStatus:"complete",statements:[],passages:[],gaps:[]}}),async()=>{throw Error("meter failed");});
  assert.equal(result.status,503);assert.equal(Object.hasOwn(result.body,"result"),false);
});
