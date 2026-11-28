import {visualKnowledgeTool} from '../visual/read';
import {executeTaskContext} from './context-execute';
import {Pool} from 'pg';
import {permits} from '../../authz/policy';
import {recordDeliveredUsage} from '../../usage/lib/buffer';
import type {CallerContext} from '../tools/s2s';
import type {DispatchResult} from '../tools/dispatch';
import {publishedSearchTool} from '../semantic/published-search-tool';
import {sourceSearchTool} from '../retrieval/source-search-tool';
import {topicKnowledgeTool} from '../semantic/topic-knowledge-tool';
import {knowledgePackageTool} from '../semantic/package-tool';
import {invocation,serviceError,type Invoke} from './contract';
import {PostgresKnowledgeServices,type TraceEnd} from './store';
export type ServiceRunner=(tool:string,args:Record<string,unknown>,caller:CallerContext,requestId:string)=>Promise<DispatchResult>;
export async function runKnowledgeBackend(tool:string,args:Record<string,unknown>,caller:CallerContext,requestId:string):Promise<DispatchResult>{
 const meter=async(workspaceId:string)=>recordDeliveredUsage({workspaceId,metric:'karda.search',amount:1,idempotencyKey:'knowledge-service:'+requestId+':'+tool});
 if(tool==='published_search')return publishedSearchTool(caller,args,undefined,meter);
 if(tool==='source_search')return sourceSearchTool(caller,args,undefined,meter);
 if(tool==='topic_knowledge')return topicKnowledgeTool(caller,args);
 if(tool==='visual_knowledge')return visualKnowledgeTool(caller,args);
 if(tool==='knowledge_package')return knowledgePackageTool(caller,args);
 throw Error('service_invalid_request');
}
export async function executeKnowledgeService(store:PostgresKnowledgeServices,caller:CallerContext,value:unknown,runner:ServiceRunner=runKnowledgeBackend):Promise<DispatchResult>{
 let input:Invoke;try{input=invocation(value);}catch(e){const f=serviceError(e);return {status:f.status,body:{error:f.code}};}
 if(input.capability==='context')return executeTaskContext(store,caller,input,runner);
 if(caller.mode!=='obo'||!caller.workspace||!caller.user||!permits(caller.productAccess,'product.enter')||!permits(caller.productAccess,'data.read')||(input.draft&&caller.callerProduct!=='karda'))return {status:403,body:{error:'service_denied',requestId:input.requestId}};
 const who={workspaceId:caller.workspace,sub:caller.user,roles:[],productCode:caller.callerProduct},started=Date.now();let traced=false;
 const steps:TraceEnd['steps']=[],usage:(TraceEnd['usage'][number]&{idempotencyKey:string})[]=[];let bytes=0;
 const finish=async(status:number,errorCode:string|null)=>store.finish(who,input,{status,errorCode,latencyMs:Date.now()-started,outputBytes:status<400?bytes:0,steps,usage});
 try{
  const s=await store.snapshot(who,input);await store.begin(who,input,s);traced=true;const c=s.config;
  const run=async(tool:string,args:Record<string,unknown>)=>{const r=await runner(tool,args,caller,input.requestId);steps.push({tool,status:r.status});if(r.status<400&&['published_search','source_search'].includes(tool))usage.push({metric:'karda.search',calls:1,idempotencyKey:'knowledge-service:'+input.requestId+':'+tool});return r;};
  let r:DispatchResult,fallback=false;
  if(input.capability==='visual')r=await run('visual_knowledge',{kb_ids:c.kbIds,query:input.query??'',top_k:Math.min(10,c.topK),...(input.assetId?{asset_id:input.assetId,version_id:input.versionId}:{}),...(input.documentId?{document_id:input.documentId}:{}),...(input.visualKind?{kind:input.visualKind}:{}),...(input.page?{page:input.page}:{})});
  else if(input.capability==='facts'){
   r=await run('published_search',{kb_ids:c.kbIds,query:input.query,top_k:c.topK,...(input.pageCursor!==undefined?{page_cursor:input.pageCursor}:{})});
   const knowledge=(r.body.result as {knowledge?:{search?:{items:unknown[]}}}|undefined)?.knowledge;
   if(r.status<400&&c.sourceFallback&&knowledge?.search?.items.length===0&&!input.pageCursor){fallback=true;r=await run('source_search',{kb_ids:c.kbIds,query:input.query,top_k:c.topK,verification_filter:c.verificationFilter});}
  }else if(input.capability==='source')r=await run('source_search',{kb_ids:c.kbIds,query:input.query,top_k:c.topK,verification_filter:c.verificationFilter});
  else if(input.capability==='topics'){
   const kbId=input.kbId??(c.kbIds.length===1?c.kbIds[0]:null);if(!kbId||!c.kbIds.includes(kbId))throw Error('service_invalid_topic_scope');
   r=await run('topic_knowledge',{kb_id:kbId,action:input.relationType?'read':'list',...(input.relationType?{relation_type:input.relationType}:{}),...(input.summaryId?{summary_id:input.summaryId}:{}),...(input.before?{before:input.before}:{})});
  }else r=await run('knowledge_package',{kb_ids:c.kbIds,entity_ids:input.entityIds,max_hops:1,max_nodes:Math.max(2,c.topK*2),max_edges:c.topK,...(input.pageCursor!==undefined?{page_cursor:input.pageCursor}:{})});
  if(r.status>=400){const raw=r.body.error;const code=typeof raw==='string'&&/^[a-z][a-z0-9_]{0,79}$/.test(raw)?raw:'service_backend_unavailable';await finish(r.status,code);return {status:r.status,body:{error:code,requestId:input.requestId,serviceId:s.id,versionId:s.versionId}};}
  const current=await store.snapshot(who,input);if(current.revision!==s.revision||current.configHash!==s.configHash||current.versionId!==s.versionId)throw Error('service_changed');
  const body={format:'karda.knowledge-service-result.v1',requestId:input.requestId,serviceId:s.id,versionId:s.versionId,configHash:s.configHash,draft:s.draft,capability:input.capability,sourceFallback:fallback,steps,result:r.body.result,usage};
  bytes=Buffer.byteLength(JSON.stringify(body));if(bytes>c.contextBytes)throw Error('service_context_budget');await finish(200,null);return {status:200,body};
 }catch(e){const f=serviceError(e);if(traced){try{await finish(f.status,f.code);}catch{return {status:503,body:{error:'service_trace_unavailable',requestId:input.requestId}};}}return {status:f.status,body:{error:f.code,requestId:input.requestId}};}
}
export async function knowledgeServiceTool(caller:CallerContext,value:Record<string,unknown>):Promise<DispatchResult>{
 if(!process.env.DATABASE_URL)return {status:503,body:{error:'service_unavailable'}};
 const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,statement_timeout:15000,connectionTimeoutMillis:5000,allowExitOnIdle:true});
 try{return await executeKnowledgeService(new PostgresKnowledgeServices(pool,async()=>permits(caller.productAccess,'product.enter')),caller,value);}finally{await pool.end();}
}
