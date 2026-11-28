import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {config,invocation,type ServiceConfig} from './contract';
import {normalizeContext,assembleContext,contextHash,type ContextUnit} from './context-engine';
import {executeKnowledgeService} from './execute';
import type {PostgresKnowledgeServices,TraceEnd} from './store';
import {PERMISSIONS} from '../../authz/policy';
import type {ContextSection} from './context-contract';
const kb=randomUUID(),doc=randomUUID(),id=randomUUID(),section:ContextSection={id:'proof',name:'Proof',mode:'source',required:true,priority:50,query:'',entityIds:[],relationTypes:[],maxHops:1,maxNodes:20,maxEdges:10};
const cfg:ServiceConfig={name:'Task recipe',description:'',kbIds:[kb],capabilities:['context'],sourceFallback:false,verificationFilter:'all',topK:10,contextBytes:16384,context:{goal:'Check requirements',allowPartial:true,maxItems:10,sections:[section]}};
const hashes={[kb+':'+doc]:'a'.repeat(64)},passage={kbId:kb,documentId:doc,documentVersion:1,contentHash:'a'.repeat(64),start:0,end:5,text:'Proof',pages:[1]};
test('task recipes reject scope escape, implicit rules, duplicate keys and cross-capability arguments',()=>{
 assert.equal(config(cfg).context!.sections[0].id,'proof');assert.throws(()=>config({...cfg,context:undefined}));assert.throws(()=>config({...cfg,context:{...cfg.context,sections:[section,section]}}));assert.throws(()=>config({...cfg,context:{...cfg.context,sections:[{...section,kbId:randomUUID()}]}}));assert.throws(()=>config({...cfg,context:{...cfg.context,sections:[{...section,mode:'topics'}]}}));assert.throws(()=>config({...cfg,context:{...cfg.context,sections:[{...section,ruleAssetId:randomUUID()}]}}));
 assert.throws(()=>invocation({serviceId:id,requestId:randomUUID(),capability:'source',query:'x',taskId:'task'}));assert.equal(invocation({serviceId:id,requestId:randomUUID(),capability:'context',query:'x',export:true}).export,true);
});
test('context selection shares evidence, keeps version boundaries, complete citations and an exact envelope byte budget',()=>{
 const a=normalizeContext(section,{items:[passage]},hashes),b=normalizeContext({...section,id:'other',required:false},{items:[passage]},hashes),recipe={...cfg.context!,sections:[a.section,b.section]};
 const {result,manifest}=assembleContext(recipe,[a,b],16384,'revision','query',null,r=>({result:r}));assert.equal(result.items.length,1);assert.equal(result.evidence.length,1);assert.equal(result.sections[1].items[0],result.sections[0].items[0]);assert.equal(result.budget.usedBytes,Buffer.byteLength(JSON.stringify({result})));assert.ok(!JSON.stringify(manifest).includes('Proof'));
 const version=normalizeContext(section,{items:[{...passage,documentVersion:2}]},hashes);assert.notEqual(version.units[0].evidence[0].id,a.units[0].evidence[0].id);
 const diff=assembleContext(recipe,[version,b],16384,'changed','query',manifest,r=>r).result.diff!;assert.equal(diff.addedEvidence,1);assert.equal(diff.removedEvidence,0);assert.equal(diff.unchanged,1);
 assert.throws(()=>normalizeContext(section,{items:[{...passage,end:999}]},hashes),/corrupt/);
});
test('context budget gives mandatory sections first chance and never slices source text',()=>{
 const a=normalizeContext(section,{items:[passage]},hashes),large:ContextUnit={...a.units[0],id:'large',data:{text:'x'.repeat(12000)}},b={section:{...section,id:'optional',required:false,priority:100},units:[large],gaps:[]};
 const output=assembleContext({...cfg.context!,sections:[b.section,a.section]},[b,a],4096,'revision','query',null,r=>r).result;assert.equal(output.items.length,1);assert.equal(output.evidence[0].text,'Proof');assert.equal(output.selection[0].excludedByBudget,1);assert.equal(output.status,'partial');assert.ok(output.budget.usedBytes<=4096);
 const insufficient=assembleContext(cfg.context!,[{...a,units:[large]}],4096,'revision','query',null,r=>r).result;assert.equal(insufficient.status,'insufficient');assert.equal(insufficient.items.length,0);
});
function fixture(){const ends:TraceEnd[]=[],snapshot={id,revision:1,versionId:randomUUID(),config:cfg,configHash:contextHash(cfg),draft:false};let stamp='current';const store={snapshot:async()=>structuredClone(snapshot),begin:async()=>{},finish:async(_w:unknown,_i:unknown,e:TraceEnd)=>{ends.push(e);},contextStamp:async()=>({hash:stamp,sourceHashes:hashes}),previousContext:async()=>null} as unknown as PostgresKnowledgeServices;return {store,ends,snapshot,change:()=>{stamp='changed';}};}
const caller={mode:'obo' as const,workspace:randomUUID(),user:'usr_'+randomUUID(),org:randomUUID(),callerProduct:'karda',productAccess:{roles:['member' as const],permissions:[...PERMISSIONS]}};
const request=()=>({serviceId:id,requestId:randomUUID(),capability:'context',query:'Requirements',taskId:'caller-task'});
test('context invocation uses section-specific usage keys, metadata-only traces and refuses changed authority or replay',async()=>{
 const f=fixture(),input=request();const r=await executeKnowledgeService(f.store,caller,input,async(tool,_args,_caller,key)=>{assert.equal(tool,'source_search');assert.equal(key,input.requestId+':proof');return {status:200,body:{result:{items:[passage]}}};});assert.equal(r.status,200);assert.equal((r.body.result as {status:string}).status,'complete');assert.ok(JSON.stringify(f.ends[0].usage).includes(input.requestId+':proof:source_search'));assert.ok(!JSON.stringify(f.ends).includes('Proof'));assert.ok(!JSON.stringify(f.ends).includes('caller-task'));
 const changed=fixture();const denied=await executeKnowledgeService(changed.store,caller,request(),async()=>{changed.change();return {status:200,body:{result:{items:[passage]}}};});assert.equal(denied.status,409);assert.ok(!('result'in denied.body));
 const replay=fixture();replay.store.begin=async()=>{throw Error('service_request_replay');};assert.equal((await executeKnowledgeService(replay.store,caller,request(),async()=>{throw Error('not called');})).status,409);
});
test('context access failures are fatal; optional outages are explicit partial delivery; export checks current permission',async()=>{
 const f=fixture();f.snapshot.config={...cfg,context:{...cfg.context!,sections:[{...section,required:false}]}};
 const outage=await executeKnowledgeService(f.store,caller,request(),async()=>({status:503,body:{error:'backend_failed'}}));assert.equal(outage.status,200);assert.equal((outage.body.result as {status:string}).status,'partial');assert.ok(JSON.stringify(outage.body.result).includes('backend_failed'));
 const denied=await executeKnowledgeService(f.store,caller,request(),async()=>({status:403,body:{error:'semantic_read_denied'}}));assert.equal(denied.status,403);assert.ok(!('result'in denied.body));
 const noExport={...caller,productAccess:{...caller.productAccess,permissions:caller.productAccess.permissions.filter(p=>p!=='data.export')}};assert.equal((await executeKnowledgeService(f.store,noExport,{...request(),export:true})).status,403);assert.equal((await executeKnowledgeService(f.store,{...caller,mode:'service',user:null},request())).status,403);
});
