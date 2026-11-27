import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config,command,invocation,serviceError,type ServiceConfig} from './contract';
import {executeKnowledgeService,type ServiceRunner} from './execute';
import type {PostgresKnowledgeServices,Snapshot,TraceEnd} from './store';
import {PERMISSIONS} from '../../authz/policy';
const kb=randomUUID(),id=randomUUID(),base:ServiceConfig={name:'Service',description:'',kbIds:[kb],capabilities:['facts','source','topics','package'],sourceFallback:true,verificationFilter:'verified_only',topK:10,contextBytes:65536};
const caller={mode:'obo' as const,workspace:randomUUID(),user:'usr_'+randomUUID(),org:randomUUID(),callerProduct:'karda',productAccess:{roles:['member' as const],permissions:[...PERMISSIONS]}};
test('knowledge service contracts: strict config, capabilities, draft and bounded request shapes',()=>{
 assert.equal(config(base).topK,10);assert.throws(()=>config({...base,kbIds:[kb,kb]}));assert.throws(()=>config({...base,sourceFallback:'true'}));assert.throws(()=>config({...base,capabilities:['source']}));assert.throws(()=>config({...base,contextBytes:100}));assert.throws(()=>config({...base,secret:'forged'}));
 assert.throws(()=>invocation({serviceId:id,requestId:randomUUID(),capability:'source',query:'x',kbId:kb}));assert.throws(()=>invocation({serviceId:id,requestId:randomUUID(),capability:'package',entityIds:[id],pageCursor:'x'}));assert.throws(()=>command({action:'apply',id,target:'draft',versionId:id,eventId:id,expectedRevision:1,previewHash:'invalid',note:'Reason'}));assert.equal(serviceError(Error('private SQL provider details')).code,'service_unavailable');
});
function fixture(c=base){let count=0;const ends:TraceEnd[]=[];const snap:Snapshot={id,revision:1,versionId:randomUUID(),config:c,configHash:'a'.repeat(64),draft:false};const store={snapshot:async()=>{count++;return structuredClone(snap);},begin:async()=>{},finish:async(_w:unknown,_i:unknown,end:TraceEnd)=>{ends.push(end);}} as unknown as PostgresKnowledgeServices;return {store,snap,ends,get count(){return count;}};}
test('knowledge service execution: same backend chain, no-match fallback, exact usage linkage and no error fallback',async()=>{
 const f=fixture(),tools:string[]=[],runner:ServiceRunner=async(tool,args)=>{tools.push(tool);assert.deepEqual(args.kb_ids,[kb]);return {status:200,body:{result:tool==='published_search'?{knowledge:{search:{items:[]}}}:{items:[{documentId:id,kbId:kb,start:0,end:4,text:'Proof'}],gaps:[]}}};};
 const requestId=randomUUID(),r=await executeKnowledgeService(f.store,caller,{serviceId:id,requestId,capability:'facts',query:'Proof'},runner);assert.equal(r.status,200);assert.deepEqual(tools,['published_search','source_search']);assert.equal(r.body.sourceFallback,true);assert.equal(f.ends[0].usage.length,2);assert.ok(JSON.stringify(f.ends[0]).includes('knowledge-service:'+requestId+':source_search'));assert.equal(f.count,2);assert.ok(!JSON.stringify(f.ends).includes('Proof'));
 const failure=fixture();let calls=0;const refused=await executeKnowledgeService(failure.store,caller,{serviceId:id,requestId:randomUUID(),capability:'facts',query:'Proof'},async()=>{calls++;return {status:403,body:{error:'semantic_read_denied'}};});assert.equal(refused.status,403);assert.equal(calls,1);assert.equal(failure.ends[0].status,403);
});
test('knowledge service execution: full response budget, changed active version and replay failures with no stale result',async()=>{
 const f=fixture({...base,contextBytes:4096});const tooBig=await executeKnowledgeService(f.store,caller,{serviceId:id,requestId:randomUUID(),capability:'source',query:'x'},async()=>({status:200,body:{result:{text:'x'.repeat(5000)}}}));assert.equal(tooBig.body.error,'service_context_budget');assert.equal(f.ends[0].status,400);assert.ok(!('result'in tooBig.body));
 const changed=fixture();const r=await executeKnowledgeService(changed.store,caller,{serviceId:id,requestId:randomUUID(),capability:'source',query:'x'},async()=>{changed.snap.revision++;return {status:200,body:{result:{items:[]}}};});assert.equal(r.status,409);assert.ok(!('result'in r.body));
 const replay=fixture();replay.store.begin=async()=>{throw Error('service_request_replay');};const duplicate=await executeKnowledgeService(replay.store,caller,{serviceId:id,requestId:randomUUID(),capability:'source',query:'x'},async()=>{throw Error('must not run');});assert.equal(duplicate.status,409);assert.equal(replay.ends.length,0);
});
test('knowledge service execution: service identity and delegated draft refused; topics and packages retain strict actual scopes',async()=>{
 const f=fixture();const input={serviceId:id,requestId:randomUUID(),capability:'package',entityIds:[]};assert.equal((await executeKnowledgeService(f.store,{...caller,mode:'service',user:null},input)).status,403);assert.equal((await executeKnowledgeService(f.store,{...caller,callerProduct:'other'},{...input,draft:true})).status,403);
 const calls:Record<string,unknown>[]=[];const run:ServiceRunner=async(_t,args)=>{calls.push(args);return {status:200,body:{result:{gaps:[]}}};};assert.equal((await executeKnowledgeService(f.store,caller,input,run)).status,200);assert.deepEqual(calls[0].entity_ids,[]);assert.equal(calls[0].max_edges,10);
 assert.equal((await executeKnowledgeService(f.store,caller,{serviceId:id,requestId:randomUUID(),capability:'topics',kbId:randomUUID()},run)).status,400);assert.equal(calls.length,1);
});
