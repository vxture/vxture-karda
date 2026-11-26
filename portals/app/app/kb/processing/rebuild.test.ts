import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync} from "node:fs";
import {parseRebuild} from "./rebuild-contract";
import {candidateIndex,type PostgresRebuild} from "./rebuild-store";
import {executeRebuild} from "./rebuild-service";
import {chunkGeneral} from "./chunk";
import {parseFastPath} from "./ir";
test("rebuild commands reject scope forgery, invalid budgets, duplicate documents and missing CAS reasons",()=>{
  const c={action:"create",id:randomUUID(),kbId:randomUUID(),documentIds:[randomUUID()],params:{targetTokens:32,maxTokens:64,overlap:0},note:"Rechunk"};
  assert.deepEqual(parseRebuild(c),c);
  for(const bad of [{...c,workspaceId:randomUUID()},{...c,documentIds:[...c.documentIds,...c.documentIds]},{...c,params:{...c.params,overlap:1}},{...c,params:{...c.params,maxTokens:31}},{...c,note:" "}])assert.throws(()=>parseRebuild(bad),/rebuild_invalid_request/);
  assert.throws(()=>parseRebuild({action:"activate",id:c.id,eventId:randomUUID(),expectedRevision:-1,note:"Confirm"}),/invalid_request/);
});
test("candidate vectors retain source ranges and reject incomplete, nonfinite or mixed-dimension embeddings",()=>{
  const chunks=chunkGeneral(parseFastPath("One verified source."));
  const good=candidateIndex(chunks,{modelCode:"model-a",vectors:[[0.1,0.2]]});
  assert.equal(good[0].start_offset,0);assert.equal(good[0].end_offset,20);assert.equal(good[0].embedding?.dim,2);
  for(const vectors of [[],[[]],[[NaN]],[[Infinity]],[[1],[2,3]]])assert.throws(()=>candidateIndex(chunks,{modelCode:"model-a",vectors}),/embedding_invalid/);
});
test("execution calls one pinned model outside claim and stores sanitized failure without automatic retry",async()=>{
  const who={workspaceId:randomUUID(),sub:"usr_"+randomUUID(),roles:[],productCode:"karda"},id=randomUUID(),doc=randomUUID(),lease=randomUUID();
  let calls=0,settled:any[]=[];
  const store={claim:async()=>({lease,params:{targetTokens:32,maxTokens:64,overlap:0},model:"model-a",ir:parseFastPath("Source text.")}),settle:async(...args:any[])=>{settled=args;}} as unknown as PostgresRebuild;
  await executeRebuild(store,who,id,doc,{embed:async(texts,pin)=>{calls++;assert.equal(pin,"model-a");return {modelCode:"model-a",vectors:texts.map(()=>[1,2])};}});
  assert.equal(calls,1);assert.equal(settled[4][0].embedding.model_code,"model-a");
  await executeRebuild(store,who,id,doc,{embed:async()=>{calls++;throw Error("provider secret");}});
  assert.equal(calls,2);assert.equal(settled[4],null);assert.equal(settled[5],"rebuild_embedding_failed");
  await executeRebuild({claim:async()=>null} as unknown as PostgresRebuild,who,id,doc,{embed:async()=>{throw Error("must not call");}});
});
test("rebuild fresh and migration structure/grants stay identical",()=>{
  const root=new URL("../../../../../deploy/database/ddl/",import.meta.url),read=(f:string)=>readFileSync(new URL(f,root),"utf8").replace(/\r\n/g,"\n");
  for(const [name,file] of [["INDEX REBUILD","00_baseline.sql"],["INDEX REBUILD LOCKS","98_column_locks.sql"]]){
    const part=(s:string)=>s.slice(s.indexOf("-- BEGIN "+name),s.indexOf("-- END "+name)+("-- END "+name).length);
    assert.equal(part(read(file)),part(read("incr/0035_index_rebuild.sql")));
  }
});
