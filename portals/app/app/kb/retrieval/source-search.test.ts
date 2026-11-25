import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {parseSourceSearch,sourcePassages,rankSourcePassages} from "./source-search";
import {sourceSearchTool} from "./source-search-tool";
import {dispatchTool} from "../tools/dispatch";
import type {CallerContext} from "../tools/s2s";
import {UsagePersistenceError} from "../../usage/lib/buffer";

const source={kbId:randomUUID(),documentId:randomUUID(),documentVersion:2,title:"test",contentHash:"a".repeat(64),verificationState:"unverified" as const};
test("source search rejects injected authority and unbounded scope, query and quality parameters",()=>{
  const args={kb_ids:[source.kbId],query:"proof"};
  assert.equal(parseSourceSearch(args).verificationFilter,"verified_and_untracked");
  assert.equal(parseSourceSearch({...args,kb_ids:[source.kbId,source.kbId.toUpperCase()]}).kbIds.length,1);
  for(const patch of [{kb_ids:[]},{kb_ids:["bad"]},{query:" "},{query:"x".repeat(501)},{top_k:21},{top_k:0},
    {verification_filter:"unverified"},{workspaceId:"other"},{schema:{}},{productCode:"runos"}])
    assert.throws(()=>parseSourceSearch({...args,...patch}),/source_search_invalid_request/);
});
test("source passages remain exact canonical slices with stable UTF-16 and physical page boundaries",()=>{
  const text="a".repeat(1199)+"\ud83d\ude00\u4e2d\u6587 proof\n"+"b".repeat(1500);
  const passages=sourcePassages(source,text,[{start:0,end:1201,page:1},{start:1201,end:text.length,page:3}]);
  assert.equal(passages.map(p=>p.text).join(""),text);
  for(const p of passages){assert.equal(p.text,text.slice(p.start,p.end));assert.ok(!/[\ud800-\udbff]$/.test(p.text));assert.ok(!/^[\udc00-\udfff]/.test(p.text));}
  assert.equal(passages[0].end,1199);assert.deepEqual(passages[1].pages,[1,3]);
  const result=rankSourcePassages(passages,"proof",10);assert.equal(result.items.length,1);
  assert.equal(result.items[0].documentVersion,2);assert.equal(result.items[0].verificationState,"unverified");
  assert.equal(rankSourcePassages(passages,"absent",10).matchedPassages,0);
});
test("source ranking is deterministic and capped without generating any new statements",()=>{
  const passages=Array.from({length:30},(_,i)=>({...source,start:i*10,end:i*10+5,text:"proof",pages:[]}));
  const result=rankSourcePassages(passages,"proof",10);
  assert.equal(result.items.length,10);assert.equal(result.matchedPassages,30);assert.equal(result.truncated,true);
  assert.deepEqual(rankSourcePassages([...passages].reverse(),"proof",10),result);
  assert.throws(()=>rankSourcePassages([passages[0],passages[0]],"proof",10),/source_search_corrupt/);
  assert.throws(()=>sourcePassages(source,"x".repeat(2*1024*1024+1)),/source_search_budget/);
});
test("source-only OBO tool carries trusted identity, refuses service/readonly and meters only deliverable results",async()=>{
  const caller:CallerContext={mode:"obo",callerProduct:"agent",org:randomUUID(),workspace:randomUUID(),user:"user",
    productAccess:{roles:["member"],permissions:["product.enter","data.read","ai.use"]}};
  let reads=0,meters=0;
  const read:Parameters<typeof sourceSearchTool>[2]=async(identity,input,admit)=>{
    reads++;assert.equal(identity.productCode,"agent");assert.equal(identity.sub,"user");assert.equal(identity.workspaceId,caller.workspace);
    assert.equal(await admit(),true);assert.equal(input.kbIds[0],source.kbId);
    return {mode:"source_only",items:[],partial:false,gaps:["no_source_matches"],searchedDocuments:0,searchedPassages:0,matchedPassages:0,truncated:false};
  };
  const backend:typeof sourceSearchTool=async(who,args)=>sourceSearchTool(who,args,read,async()=>{meters++;});
  const backends={listKbs:async()=>[],sourceSearch:backend},args={kb_ids:[source.kbId],query:"proof"};
  assert.equal((await dispatchTool("karda.source_search",args,caller,backends)).status,200);assert.equal(meters,1);
  assert.equal((await dispatchTool("karda.source_search",args,{...caller,mode:"service",user:null},backends)).status,403);
  assert.equal((await dispatchTool("karda.source_search",args,{...caller,productAccess:{roles:["readonly"],permissions:["product.enter","data.read"]}},backends)).status,403);
  assert.equal(reads,1);
  assert.equal((await sourceSearchTool(caller,args,read,async()=>{throw new UsagePersistenceError();})).status,503);
  const failure=await sourceSearchTool(caller,args,async()=>{throw new Error("private database error");},async()=>{meters++;});
  assert.deepEqual(failure,{status:503,body:{error:"source_search_unavailable"}});assert.equal(meters,1);
});
