import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {PostgresKnowledgeServices} from './store';
import {executeKnowledgeService,type ServiceRunner} from './execute';
import {config,type Invoke,type ServiceConfig} from './contract';
import {PERMISSIONS} from '../../authz/policy';
import {PostgresSemanticStore,PostgresFormalSemanticLoader} from '../semantic/store-postgres';
import {PostgresSemanticReader} from '../semantic/read-postgres';
import {parsePackageRequest} from '../semantic/knowledge-package';
import {parsePublishedSearch} from '../semantic/published-search';
import {PostgresSourceSearch} from '../retrieval/source-search-postgres';
import {parseSourceSearch} from '../retrieval/source-search';
import {PostgresTopicKnowledge,parseTopicKnowledge} from '../semantic/topic-knowledge';
import {localCompileProfile} from '../semantic/compile-profile';
import {sourceHash} from '../processing/source-snapshot';
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test('knowledge services PostgreSQL: complete create/configure/release/debug/call/trace/rollback/stop and current authority lifecycle',{skip:!endpoint,timeout:60000},async()=>{
 const url=new URL(endpoint!);assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));assert.equal(url.pathname,'/karda_p3_test');const admin=new Pool({connectionString:url.toString()});url.username='karda_svc';const service=new Pool({connectionString:url.toString(),max:3});
 const ws=randomUUID(),kb=randomUUID(),sub='usr_'+randomUUID(),doc=randomUUID(),a=randomUUID(),span=randomUUID(),left=randomUUID(),right=randomUUID(),relation=randomUUID(),id=randomUUID();
 const who={workspaceId:ws,sub,roles:[],productCode:'karda'},raw=Buffer.from('Approval required.'),hash=sourceHash(raw),objects={get:async()=>raw};let member:string|undefined;
 const store=new PostgresKnowledgeServices(service,async()=>true),semantic=new PostgresSemanticStore(service,objects,async()=>true);
 const caller={mode:'obo' as const,workspace:ws,user:sub,org:randomUUID(),callerProduct:'karda',productAccess:{roles:['member' as const],permissions:[...PERMISSIONS]}};
 const cfg:ServiceConfig=config({name:'Agent service',description:'Evidence knowledge',kbIds:[kb],capabilities:['facts','topics','source','package'],sourceFallback:true,verificationFilter:'all',topK:10,contextBytes:65536});
 const request=(capability:Invoke['capability'],extra:Partial<Invoke>={}):Invoke=>({serviceId:id,requestId:randomUUID(),capability,draft:false,...extra});
 const loader=new PostgresFormalSemanticLoader(),reader=new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>loader.load(db,ids)),sourceReader=new PostgresSourceSearch(service,objects,async()=>true),topics=new PostgresTopicKnowledge(service,objects,async()=>true);
 const real:ServiceRunner=async(tool,args,actor,requestId)=>{
  const identity={workspaceId:actor.workspace!,sub:actor.user!,productCode:actor.callerProduct,roles:[]};let result:unknown;
  if(tool==='published_search'){const q=parsePublishedSearch(args);result={format:'karda.published-search.v1',knowledge:await reader.readPackage(identity,q.kbIds,{seedIds:['directory'],maxHops:0,maxNodes:40,maxEdges:20},true,false,undefined,q)};}
  else if(tool==='source_search')result=await sourceReader.read(identity,parseSourceSearch(args));
  else if(tool==='topic_knowledge')result=await topics.read(identity,parseTopicKnowledge(args));
  else{const q=parsePackageRequest(args);result=await reader.readPackage(identity,q.kbIds??[q.kbId],q.query,q.directory);}
  if(tool==='published_search'||tool==='source_search')await service.query("INSERT INTO local_usage.raw(workspace_id,metric,amount,idempotency_key) VALUES($1,'karda.search',1,$2) ON CONFLICT DO NOTHING",[ws,'knowledge-service:'+requestId+':'+tool]);
  return {status:200,body:{result}};
 };
 const preview=(target='draft')=>store.command(who,{action:'preview',id,target}) as Promise<any>;
 const apply=async(target='draft',p?:any)=>{const v=p??await preview(target);return store.command(who,{action:'apply',id,target,versionId:randomUUID(),eventId:randomUUID(),expectedRevision:v.revision,previewHash:v.previewHash,note:'Explicit publication decision'});};
 try{
  member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
  await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
  await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'Pilot')",[kb,ws,sub]);
  await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
  await admin.query("INSERT INTO karda_kb.document(id,kb_id,title,source,content_state,active_chunk_version,storage_ref,content_hash,mime,size_bytes) VALUES($1,$2,'Proof','upload','indexed',1,'synthetic',$3,'text/plain',$4)",[doc,kb,hash,raw.length]);
  await admin.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$3,'thing','Approval'),($2,$3,'thing','Required')",[left,right,kb]);
  await admin.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'fact','Approval required','indexed','verified')",[a,kb]);
  await admin.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,1,0,$3,$4)",[span,doc,raw.length,raw.toString()]);
  await admin.query("INSERT INTO karda_kb.evidence(assertion_id,span_id,stance) VALUES($1,$2,'supports')",[a,span]);
  const profile=localCompileProfile(),run=await semantic.recordCompile(who,kb,{taskKey:"a".repeat(64),configHash:"b".repeat(64),payload:{format:"karda.semantic.release.v1",...profile,
   relations:[{id:relation,kbId:kb,schema:{namespace:profile.schema.namespace,schemaId:profile.schema.schemaId,version:profile.schema.version},type:"requires",sourceId:left,targetId:right,assertionIds:[a],origin:"asserted"}],sources:[{kbId:kb,documentId:doc,version:1,contentHash:hash}]}});
  await semantic.reviewRelation(who,kb,{runId:run.runId,relationId:relation,expectedRevision:0,decision:"accept",note:"Synthetic fixture review"});
  await semantic.publish(who,await semantic.plan(who,kb,run.runId,randomUUID(),0));

  const create={action:'create',id,config:cfg,note:'Create complete service'};await store.command(who,create);assert.equal((await store.command(who,create) as any).duplicate,true);await assert.rejects(store.command(who,{...create,note:'Different'}),/service_conflict/);
  assert.equal((await new PostgresKnowledgeServices(service,async()=>true).browse(who,{id})).detail!.draft.name,cfg.name);
  assert.equal((await executeKnowledgeService(store,caller,request('source',{query:'Approval'}),real)).status,409);
  const stale=await preview();await admin.query("UPDATE karda_kb.knowledge_base SET name='Changed library' WHERE id=$1",[kb]);await assert.rejects(apply('draft',stale),/service_preview_changed/);
  const first:any=await apply(),v1=first.versionId;assert.ok(v1);const r=request('facts',{query:'Approval'}),called=await executeKnowledgeService(store,caller,r,real);assert.equal(called.status,200);assert.equal(called.body.versionId,v1);assert.equal((called.body.result as any).knowledge.edges.length,1);assert.equal((await executeKnowledgeService(store,caller,r,real)).status,409);
  const metadata=(await store.browse(who,{id,requestId:r.requestId})).detail!.calls[0];assert.equal(metadata.state,'succeeded');assert.equal(metadata.version_id,v1);assert.equal((metadata.usage as any[])[0].idempotencyKey,'knowledge-service:'+r.requestId+':published_search');assert.ok(!JSON.stringify(metadata).includes('Approval'));
  // Full task-context lifecycle over the same real published/source readers.
  const contextSection={id:'facts',name:'Facts',mode:'facts',required:true,priority:80,query:'',entityIds:[],relationTypes:[],maxHops:1,maxNodes:20,maxEdges:10};
  const contextConfig=config({...cfg,capabilities:[...cfg.capabilities,'context'],context:{goal:'Prepare task',allowPartial:true,maxItems:20,sections:[contextSection,{...contextSection,id:'source',name:'Source',mode:'source'},{...contextSection,id:'topic',name:'Topic',mode:'topics',kbId:kb,relationType:'requires'},{...contextSection,id:'graph',name:'Graph',mode:'package',entityIds:[left]}]}});
  await store.command(who,{action:'save',id,eventId:randomUUID(),expectedRevision:(await store.browse(who,{id})).detail!.revision,config:contextConfig,note:'Configure task context'});await apply();
  const contextInput=request('context',{query:'Approval',taskId:'task-1'}),contextCall=await executeKnowledgeService(store,caller,contextInput,real);assert.equal(contextCall.status,200,JSON.stringify(contextCall.body));const contextBody=contextCall.body.result as any;assert.equal(contextBody.sections.length,4);assert.equal(contextBody.evidence.length,1);assert.ok(contextBody.items.length>=2);assert.equal(contextBody.budget.usedBytes,Buffer.byteLength(JSON.stringify(contextCall.body)));
  const contextTrace=(await store.browse(who,{id,requestId:contextInput.requestId})).detail!.calls[0];assert.ok(contextTrace.context_metadata);assert.ok(!JSON.stringify(contextTrace).includes('Approval'));assert.ok(!JSON.stringify(contextTrace).includes('task-1'));
  const refreshed=await executeKnowledgeService(store,caller,request('context',{query:'Approval',taskId:'task-1',previousRequestId:contextInput.requestId,export:true}),real);assert.equal(refreshed.status,200);assert.equal((refreshed.body.result as any).diff.comparable,true);assert.equal((refreshed.body.result as any).diff.added,0);
  const beforeContext=await store.contextStamp(who,contextConfig);await admin.query("UPDATE karda_kb.assertion SET expires_at=now()-interval '1 minute' WHERE id=$1",[a]);assert.notEqual((await store.contextStamp(who,contextConfig)).hash,beforeContext.hash);await admin.query('UPDATE karda_kb.assertion SET expires_at=NULL WHERE id=$1',[a]);
  const changingContext=await executeKnowledgeService(store,caller,request('context',{query:'Approval'}),async(...args)=>{const value=await real(...args);if(args[0]==='knowledge_package')await admin.query("UPDATE karda_kb.document SET title='Changed proof' WHERE id=$1",[doc]);return value;});assert.equal(changingContext.status,409);assert.ok(!('result'in changingContext.body));
  const restoredBeforeSave:any=await apply(v1);
  const fallback=await executeKnowledgeService(store,caller,request('facts',{query:'nonmatching-token'}),real);assert.equal(fallback.status,200);assert.equal(fallback.body.sourceFallback,true);assert.equal((fallback.body.steps as unknown[]).length,2);
  assert.equal((await executeKnowledgeService(store,caller,request('topics'),real)).status,200);assert.equal((await executeKnowledgeService(store,caller,request('package',{entityIds:[]}),real)).status,200);
  let detail=(await store.browse(who,{id})).detail!;const saved={action:'save',id,eventId:randomUUID(),expectedRevision:detail.revision,config:{...cfg,name:'Draft updated',topK:2},note:'Tune service'};
  await store.command(who,saved);assert.equal((await store.command(who,saved) as any).duplicate,true);assert.equal((await store.browse(who,{id})).detail!.active_version,restoredBeforeSave.versionId);
  const draft=await executeKnowledgeService(store,caller,request('package',{entityIds:[],draft:true}),real);assert.equal(draft.status,200);assert.equal(draft.body.versionId,null);
  const v2:any=await apply();assert.notEqual(v2.versionId,v1);const rolled:any=await apply(v1);assert.notEqual(rolled.versionId,v1);assert.equal((await store.browse(who,{id})).detail!.active!.topK,cfg.topK);
  await assert.rejects(service.query("UPDATE karda_kb.knowledge_service_version SET config='{}' WHERE id=$1",[v1]),/permission denied/);await assert.rejects(service.query("DELETE FROM karda_kb.knowledge_service_event WHERE service_id=$1",[id]),/permission denied/);
  const during=await executeKnowledgeService(store,caller,request('source',{query:'Approval'}),async(...args)=>{const result=await real(...args);await apply('stop');return result;});assert.equal(during.status,409);assert.ok(!('result'in during.body));assert.equal((await executeKnowledgeService(store,caller,request('source',{query:'Approval'}),real)).status,409);
  await apply(v1);
  await admin.query("UPDATE karda_kb.document SET content_state='deleted' WHERE id=$1",[doc]);const deleted=await executeKnowledgeService(store,caller,request('facts',{query:'Approval'}),real);assert.equal(deleted.status,200);assert.equal((deleted.body.result as any).items.length,0,'deleted source cannot leak old published facts');
  await admin.query('DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1',[kb]);assert.equal((await executeKnowledgeService(store,caller,request('source',{query:'Approval'}),real)).status,403);
  assert.equal((await store.browse(who,{id})).detail!.state,'active','management metadata remains available for repair');await assert.rejects(store.browse({...who,workspaceId:randomUUID()},{id}),/service_denied/);
  await admin.query('DELETE FROM local_authz.member_role WHERE member_id=$1',[member]);assert.equal((await executeKnowledgeService(store,caller,request('package',{entityIds:[]}),real)).status,403);await assert.rejects(store.browse(who,{id}),/service_denied/);
 }finally{
  await admin.query('DELETE FROM karda_kb.knowledge_service WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM local_usage.raw WHERE workspace_id=$1',[ws]);
  for(const table of ["semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion","semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])await admin.query("DELETE FROM karda_kb."+table+" WHERE kb_id=$1",[kb]);
  await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
  if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
  await service.end();await admin.end();
 }
});
