import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {knowledgeSyncResult,parseKnowledgeSync,readKnowledgeSync} from "./knowledge-sync";
import {knowledgeSyncTool} from "./sync-tool";
import {dispatchTool} from "../tools/dispatch";
import type {CallerContext} from "../tools/s2s";
import type {KnowledgePackage} from "./read-postgres";

const kb=randomUUID(),identity={workspaceId:randomUUID(),sub:"usr_sync",roles:[],productCode:"runos"};
const args={kb_id:kb,entity_ids:[]},request=parseKnowledgeSync(args);
const empty=():KnowledgePackage=>({format:"karda.knowledge-package.v1",schema:{namespace:"local",schemaId:"objects",version:"1"},nodes:[],edges:[],assertions:[],evidence:[],statements:[],passages:[],sourceStatus:"complete",gaps:["no_published_support"],truncated:false});

test("knowledge sync validates the same bounded package contract and an optional exact revision",()=>{
  assert.equal(request.input.directory,true);
  assert.equal(parseKnowledgeSync({...args,known_revision:"a".repeat(64)}).knownRevision,"a".repeat(64));
  for(const patch of [{known_revision:null},{known_revision:""},{known_revision:"A".repeat(64)},{known_revision:1},{known_revision:"a".repeat(65)},
    {identity},{schema:{}},{max_nodes:501},{max_edges:1001},{kb_ids:[kb]}, {page_cursor:"invalid"}])
    assert.throws(()=>parseKnowledgeSync({...args,...patch}),/semantic_invalid_sync_request/);
});

test("sync revisions bind identity, exact window and complete delivered content without wall-clock churn",()=>{
  const pack=empty(),first=knowledgeSyncResult(identity,request,pack,"2026-01-01T00:00:00Z");
  assert.equal(first.action,"replace");assert.equal(first.knowledge,pack);assert.equal(first.reuse,"revalidate");
  const next=knowledgeSyncResult(identity,{...request,knownRevision:first.revision},pack,"2026-01-02T00:00:00Z");
  assert.equal(next.action,"unchanged");assert.equal(next.knowledge,null);
  for(const who of [{...identity,sub:"other"},{...identity,workspaceId:randomUUID()},{...identity,productCode:"arda"}])
    assert.notEqual(knowledgeSyncResult(who,request,pack).revision,first.revision);
  for(const input of [parseKnowledgeSync({...args,max_nodes:100}),parseKnowledgeSync({...args,page_cursor:""}),parseKnowledgeSync({kb_id:randomUUID(),entity_ids:[]})])
    assert.notEqual(knowledgeSyncResult(identity,input,pack).revision,first.revision);
  for(const patch of [{sourceStatus:"partial" as const},{truncated:true},{gaps:["source_support_unavailable"]},
    {schema:{...pack.schema,version:"2"}},{nodes:[{id:"one",kbId:kb,type:"entity",label:"renamed"}]},
    {statements:[{id:"one",statement:"changed"}]},{passages:[{evidenceId:"one",excerpt:"changed"}]}])
    assert.notEqual(knowledgeSyncResult(identity,request,{...pack,...patch}).revision,first.revision);
  const reordered=Object.fromEntries(Object.entries(pack).reverse()) as KnowledgePackage;
  assert.equal(knowledgeSyncResult(identity,request,reordered).revision,first.revision);
  const multi=parseKnowledgeSync({kb_ids:[kb,identity.workspaceId],entity_ids:[],relation_types:["b","a"]});
  assert.equal(knowledgeSyncResult(identity,multi,pack).revision,knowledgeSyncResult(identity,parseKnowledgeSync({kb_ids:[identity.workspaceId,kb,kb],entity_ids:[],relation_types:["a","b"]}),pack).revision);
  assert.throws(()=>knowledgeSyncResult(identity,request,{...pack,passages:[{evidenceId:"large",excerpt:"x".repeat(2*1024*1024)}]}),/semantic_sync_budget/);
});

test("matching sync revisions never bypass source/authority reads, empty replacement or failure",async()=>{
  const pack=empty(),first=knowledgeSyncResult(identity,request,pack);let calls=0;
  const result=await readKnowledgeSync(identity,{...request,knownRevision:first.revision},async()=>true,async(_who,_input,admit)=>{
    calls++;assert.equal(await admit(),true);return pack;
  });
  assert.equal(result.action,"unchanged");assert.equal(calls,1);
  const old=knowledgeSyncResult(identity,request,{...pack,nodes:[{id:"old",kbId:kb,type:"entity",label:"old"}]});
  const withdrawn=await readKnowledgeSync(identity,{...request,knownRevision:old.revision},async()=>true,async()=>pack);
  assert.equal(withdrawn.action,"replace");assert.deepEqual(withdrawn.knowledge?.nodes,[]);
  for(const code of ["semantic_read_denied","semantic_directory_changed","storage failed"])
    await assert.rejects(readKnowledgeSync(identity,{...request,knownRevision:first.revision},async()=>false,async()=>{throw new Error(code);}),new RegExp(code));
});

test("sync tool enforces OBO/read authority, dispatch and safe error mapping",async()=>{
  const caller:CallerContext={mode:"obo",callerProduct:"runos",org:randomUUID(),workspace:identity.workspaceId,user:identity.sub,
    productAccess:{roles:["readonly"],permissions:["product.enter","data.read"]}};
  let calls=0;
  const backend:typeof knowledgeSyncTool=async(who,input)=>knowledgeSyncTool(who,input,async(current,input,admit)=>{
    calls++;assert.equal(current.productCode,"runos");assert.equal(current.sub,identity.sub);assert.equal(await admit(),true);
    return knowledgeSyncResult(current,input,empty());
  });
  const backends={listKbs:async()=>[],knowledgeSync:backend};
  assert.equal((await dispatchTool("karda.knowledge_sync",args,caller,backends)).status,200);
  const deniedCallers:CallerContext[]=[{...caller,mode:"service",user:null},{...caller,productAccess:undefined},
    {...caller,productAccess:{roles:[],permissions:["product.enter"]}}];
  for(const who of deniedCallers)
    assert.equal((await dispatchTool("karda.knowledge_sync",args,who,backends)).status,403);
  assert.equal(calls,1);
  assert.equal((await knowledgeSyncTool(caller,{...args,known_revision:"bad"})).status,400);
  for(const [code,status] of [["semantic_read_denied",403],["semantic_directory_changed",409],["private SQL error",503]] as const){
    const result=await knowledgeSyncTool(caller,args,async()=>{throw new Error(code);});
    assert.equal(result.status,status);assert.equal(result.body.error,status===503?"semantic_sync_unavailable":code);
  }
});
