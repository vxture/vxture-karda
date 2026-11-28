import {permits} from '../../authz/policy';
import type {CallerContext} from '../tools/s2s';
import type {DispatchResult} from '../tools/dispatch';
import type {Invoke} from './contract';
import {serviceError} from './contract';
import {assembleContext,normalizeContext,contextHash,type SectionInput,type ContextManifest,type ContextResult} from './context-engine';
import type {PostgresKnowledgeServices,TraceEnd} from './store';
import type {ServiceRunner} from './execute';
export async function executeTaskContext(store:PostgresKnowledgeServices,caller:CallerContext,input:Invoke,runner:ServiceRunner):Promise<DispatchResult>{
 if(caller.mode!=='obo'||!caller.workspace||!caller.user||!permits(caller.productAccess,'product.enter')||!permits(caller.productAccess,'data.read')||input.draft&&caller.callerProduct!=='karda'||input.export&&!permits(caller.productAccess,'data.export'))return {status:403,body:{error:'service_denied'}};
 const who={workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},started=Date.now(),steps:TraceEnd['steps']=[],usage:(TraceEnd['usage'][number]&{idempotencyKey:string})[]=[];let traced=false,bytes=0,manifest:ContextManifest|undefined;
 const finish=async(status:number,errorCode:string|null)=>store.finish(who,input,{status,errorCode,latencyMs:Date.now()-started,outputBytes:status<400?bytes:0,steps,usage,...(status<400?{context:manifest}:{})});
 try{
  const snapshot=await store.snapshot(who,input),c=snapshot.config,recipe=c.context;if(!recipe)throw Error('service_invalid_context');
  await store.begin(who,input,snapshot);traced=true;
  const initial=await store.contextStamp(who,c),previous=await store.previousContext(who,input),sections:SectionInput[]=[];
  for(const section of recipe.sections){
   const kbIds=section.kbId?[section.kbId]:c.kbIds,query=[section.query,input.query].filter(Boolean).join(' '),key=input.requestId+':'+section.id;
   let tool:string,args:Record<string,unknown>;
   if(section.mode==='facts'){tool='published_search';args={kb_ids:kbIds,query,top_k:c.topK};}
   else if(section.mode==='visual'){tool='visual_knowledge';args={kb_ids:kbIds,query,top_k:Math.min(10,c.topK),...(section.visualKind?{kind:section.visualKind}:{})};}
   else if(section.mode==='source'){tool='source_search';args={kb_ids:kbIds,query,top_k:c.topK,verification_filter:c.verificationFilter};}
   else if(section.mode==='topics'){tool='topic_knowledge';args={kb_id:section.kbId,action:'read',relation_type:section.relationType};}
   else{tool='knowledge_package';args={...(section.ruleAssetId?{kb_id:section.kbId,rule_asset_id:section.ruleAssetId}:{kb_ids:kbIds}),entity_ids:section.entityIds,relation_types:section.relationTypes,max_hops:section.maxHops,max_nodes:section.maxNodes,max_edges:section.maxEdges};}
   let r:DispatchResult;try{r=await runner(tool,args,caller,key);}catch{r={status:503,body:{error:'service_backend_unavailable'}};}
   steps.push({tool,status:r.status,sectionId:section.id});
   if(r.status<400&&['published_search','source_search'].includes(tool))usage.push({metric:'karda.search',calls:1,idempotencyKey:'knowledge-service:'+key+':'+tool});
   if(r.status>=400){if(r.body.error==='knowledge_rollout_paused')throw Error('service_inactive');if([401,403].includes(r.status))throw Error('service_scope_denied');if(r.status===409)throw Error('service_changed');if(!recipe.allowPartial||section.required)throw Error('service_context_backend_unavailable');sections.push({section,units:[],gaps:['backend_failed']});continue;}
   sections.push(normalizeContext(section,r.body.result,initial.sourceHashes));
  }
  const current=await store.snapshot(who,input),final=await store.contextStamp(who,c);
  if(current.revision!==snapshot.revision||current.versionId!==snapshot.versionId||current.configHash!==snapshot.configHash||final.hash!==initial.hash)throw Error('service_changed');
  const wrap=(result:ContextResult)=>({format:'karda.knowledge-service-result.v1',requestId:input.requestId,serviceId:snapshot.id,versionId:snapshot.versionId,configHash:snapshot.configHash,draft:snapshot.draft,capability:'context',...(input.taskId?{taskId:input.taskId}:{}),...(input.runId?{runId:input.runId}:{}),steps,result,usage});
  const output=assembleContext(recipe,sections,c.contextBytes,final.hash,contextHash([who.workspaceId,who.sub,who.productCode,input.query,input.taskId??null,input.runId??null]),previous,wrap);manifest=output.manifest;
  const body=wrap(output.result);bytes=Buffer.byteLength(JSON.stringify(body));await finish(200,null);return {status:200,body};
 }catch(e){const f=serviceError(e);if(traced)try{await finish(f.status,f.code);}catch{return {status:503,body:{error:'service_trace_unavailable',requestId:input.requestId}};}return {status:f.status,body:{error:f.code,requestId:input.requestId}};}
}
