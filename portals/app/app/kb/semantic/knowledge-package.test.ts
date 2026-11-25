import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {parsePackageRequest} from "./knowledge-package";
import {knowledgePackageTool} from "./package-tool";
import {dispatchTool} from "../tools/dispatch";
import type {CallerContext} from "../tools/s2s";

test("knowledge package requests are bounded and cannot choose identity, schema or evidence",()=>{
  const value={kb_id:randomUUID(),entity_ids:[randomUUID()]};
  assert.equal(parsePackageRequest(value).query.maxHops,1);
  assert.equal(parsePackageRequest({...value,entity_ids:[]}).directory,true);
  for(const extra of [{kb_id:"bad"},{entity_ids:["bad"]},{max_hops:5},{max_nodes:501},{max_edges:1001},
    {schema:{}},{user:"other"},{relations:[]},{source_revision:"old"},{relation_types:[1]}])
    assert.throws(()=>parsePackageRequest({...value,...extra}),/semantic_invalid_package_request/);
});
test("cross-library package input is explicit, bounded, deduplicated and mutually exclusive with the legacy single library",()=>{
  const a=randomUUID(),b=randomUUID(),value={kb_ids:[a,b,a],entity_ids:[]};
  const input=parsePackageRequest(value);assert.deepEqual(input.kbIds,[a,b]);assert.equal(input.kbId,a);assert.equal(input.directory,true);
  for(const patch of [{kb_id:a},{kb_ids:[]},{kb_ids:["bad"]},{kb_ids:Array.from({length:21},()=>randomUUID())},{kb_ids:[a],productCode:"other"}])
    assert.throws(()=>parsePackageRequest({...value,...patch}),/semantic_invalid_package_request/);
});

test("published package tool uses authenticated calling product and read permission, refuses service before backend",async()=>{
  const caller:CallerContext={mode:"obo",callerProduct:"runos",org:randomUUID(),workspace:randomUUID(),user:`usr_${randomUUID()}`,
    productAccess:{roles:["readonly"],permissions:["product.enter","data.read"]}};
  const args={kb_id:randomUUID(),entity_ids:[randomUUID()]};let calls=0;
  const backend:typeof knowledgePackageTool=async(who,input)=>knowledgePackageTool(who,input,async(identity,request,admit)=>{
    calls++;assert.equal(identity.productCode,"runos");assert.equal(identity.sub,caller.user);assert.equal(identity.workspaceId,caller.workspace);
    assert.equal(await admit(),true);assert.equal(request.kbId,args.kb_id);
    return {format:"karda.knowledge-package.v1",schema:{namespace:"test",schemaId:"test",version:"1"},nodes:[],edges:[],assertions:[],evidence:[],
      truncated:false,sourceStatus:"complete",statements:[],passages:[],gaps:["no_published_support"]};
  });
  const backends={listKbs:async()=>[],knowledgePackage:backend};
  assert.equal((await dispatchTool("karda.knowledge_package",args,caller,backends)).status,200);assert.equal(calls,1);
  assert.equal((await dispatchTool("karda.knowledge_package",args,{...caller,mode:"service",user:null},backends)).status,403);
  assert.equal((await dispatchTool("karda.knowledge_package",args,{...caller,productAccess:undefined},backends)).status,403);assert.equal(calls,1);
  const denied=await knowledgePackageTool(caller,args,async()=>{throw new Error("private SQL error");});
  assert.deepEqual(denied,{status:503,body:{error:"semantic_package_unavailable"}});
});
