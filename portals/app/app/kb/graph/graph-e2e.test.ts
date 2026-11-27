import test from 'node:test';
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {GraphStore} from './store';
import {queryIndex,graphManifest,jenaCommand,scopeKey} from './client';
import {inferCurrent} from './rules';
import {PostgresSemanticStore,PostgresFormalSemanticLoader} from '../semantic/store-postgres';
import {PostgresSemanticReader} from '../semantic/read-postgres';
import {localCompileProfile} from '../semantic/compile-profile';
import {sourceHash} from '../processing/source-snapshot';
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test('CI graph end-to-end: real publication/current source authority to TDB HTTP queries and enabled Jena rule proofs; revocation and stop fail closed',{skip:!endpoint,timeout:90000},async()=>{
 // This process fixture belongs to remote CI only. Never start a local server.
 assert.equal(process.env.CI,'true','run the complete integration stage in remote CI');
 const url=new URL(endpoint!);assert.equal(url.pathname,'/karda_p3_test');assert.ok(['localhost','127.0.0.1','[::1]'].includes(url.hostname));
 const admin=new Pool({connectionString:url.toString()});url.username='karda_svc';const service=new Pool({connectionString:url.toString(),max:3});
 const ws=randomUUID(),kb=randomUUID(),sub='usr_'+randomUUID(),who={workspaceId:ws,sub,roles:[],productCode:'karda'},doc=randomUUID(),assertion=randomUUID(),span=randomUUID(),left=randomUUID(),middle=randomUUID(),right=randomUUID(),r1=randomUUID(),r2=randomUUID(),assetId=randomUUID(),indexId=randomUUID();
 const raw=Buffer.from('Synthetic hierarchy evidence.'),contentHash=sourceHash(raw),objects={get:async()=>raw},schema=localCompileProfile();let member:string|undefined;
 const folder=await mkdtemp(join(tmpdir(),'karda-tdb-ci-')),oldUrl=process.env.KARDA_JENA_URL,oldSecret=process.env.OIDC_CLIENT_SECRET;process.env.KARDA_JENA_URL='http://127.0.0.1:8080/internal';process.env.OIDC_CLIENT_SECRET='synthetic-jena-ci-secret-000000000';
 const java=spawn('java',['-Xmx256m','-cp',resolve('../semantic/target/karda-semantic.jar')+':'+resolve('../semantic/target/lib')+'/*','work.ruyin.karda.SemanticServer'],{windowsHide:true,stdio:['ignore','ignore','ignore'],env:{...process.env,KARDA_TDB_ROOT:folder}});
 let startError:Error|undefined;java.on('error',e=>{startError=e;});
 try{
  let ready=false;for(let i=0;i<60;i++){try{await jenaCommand({operation:'health'});ready=true;break;}catch{if(startError)throw startError;await new Promise(r=>setTimeout(r,100));}}assert.ok(ready,'real Jena internal service ready');
  member=(await admin.query('INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id',[ws,sub])).rows[0].id;await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
  await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'TDB integration')",[kb,ws,sub]);await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
  await admin.query("INSERT INTO karda_kb.document(id,kb_id,title,source,content_state,active_chunk_version,storage_ref,content_hash,mime,size_bytes) VALUES($1,$2,'Proof','upload','indexed',1,'synthetic',$3,'text/plain',$4)",[doc,kb,contentHash,raw.length]);
  for(const [id,name]of [[left,'Left'],[middle,'Middle'],[right,'Right']])await admin.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$2,'thing',$3)",[id,kb,name]);
  await admin.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'fact','Synthetic hierarchy','indexed','verified')",[assertion,kb]);await admin.query('INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,1,0,$3,$4)',[span,doc,raw.length,raw.toString()]);await admin.query("INSERT INTO karda_kb.evidence(assertion_id,span_id,stance) VALUES($1,$2,'supports')",[assertion,span]);
  const semantic=new PostgresSemanticStore(service,objects,async()=>true),relations=[[r1,left,middle],[r2,middle,right]].map(([id,sourceId,targetId])=>({id,kbId:kb,schema:schema.schema,type:'part_of',sourceId,targetId,assertionIds:[assertion],origin:'asserted' as const}));
  const run=await semantic.recordCompile(who,kb,{taskKey:'a'.repeat(64),configHash:'b'.repeat(64),payload:{format:'karda.semantic.release.v1',...schema,relations,sources:[{kbId:kb,documentId:doc,version:1,contentHash}]}});for(const relation of relations)await semantic.reviewRelation(who,kb,{runId:run.runId,relationId:relation.id,expectedRevision:0,decision:'accept',note:'Synthetic integration review'});await semantic.publish(who,await semantic.plan(who,kb,run.runId,randomUUID(),0));
  const loader=new PostgresFormalSemanticLoader();let manifest:Awaited<ReturnType<typeof graphManifest>>|undefined;
  const capture=new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>loader.load(db,ids),undefined,async(g,s,q,d,db)=>{manifest=await graphManifest(db,g,s,[kb]);return g;});
  await capture.readPackage(who,[kb],{seedIds:['directory'],maxHops:0,maxNodes:50,maxEdges:100},true);assert.ok(manifest);const m=manifest!;
  await jenaCommand({operation:'build',key:m.fingerprint,data:m.rdf.data,shapes:m.rdf.shapes});
  await admin.query("INSERT INTO karda_kb.graph_index(id,workspace_id,created_by,kb_ids,scope_key,state,active_hash) VALUES($1,$2,$3,$4,$5,'ready',$6)",[indexId,ws,sub,JSON.stringify([kb]),scopeKey([kb]),m.fingerprint]);
  const reader=new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>loader.load(db,ids),undefined,(g,s,q,d,db)=>queryIndex(who,[kb],g,s,q,d,db));
  const pack=await reader.readPackage(who,[kb],{seedIds:[left],maxHops:2,maxNodes:50,maxEdges:100,direction:'out'});assert.equal(pack.edges.length,2);assert.equal((await reader.readPackage(who,[kb],{seedIds:[left],maxHops:2,maxNodes:50,maxEdges:100,direction:'in'})).edges.length,0);
  const store=new GraphStore(service,async()=>true);await store.command(who,{kbId:kb,id:assetId,requestId:randomUUID(),revision:0,action:'save',note:'Create finite rules',kind:'rules',title:'Transitive hierarchy',visibility:'personal',config:{schema:schema.schema,rules:[{id:'hierarchy',kind:'transitive',input:'part_of',output:'part_of'}]}});await store.command(who,{kbId:kb,id:assetId,requestId:randomUUID(),revision:1,action:'publish',note:'Enable finite rules'});
  const inferred=await inferCurrent(service,store,who,kb,assetId,pack);assert.equal(inferred.inferences.length,1);assert.equal(inferred.inferences[0].premiseIds.length,2);assert.equal(inferred.inferences[0].evidenceIds.length,1);
  await store.command(who,{kbId:kb,id:assetId,requestId:randomUUID(),revision:2,action:'stop',note:'Stop rules'});await assert.rejects(inferCurrent(service,store,who,kb,assetId,pack),/graph_denied/);
  await admin.query("UPDATE karda_kb.document SET content_state='archived' WHERE id=$1",[doc]);await assert.rejects(reader.readPackage(who,[kb],{seedIds:[left],maxHops:2,maxNodes:50,maxEdges:100}),/graph_index_changed/);
  await admin.query('DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1',[kb]);await assert.rejects(reader.readPackage(who,[kb],{seedIds:[left],maxHops:2,maxNodes:50,maxEdges:100}),/semantic_read_denied/);
 }finally{
  java.kill();await Promise.race([new Promise(r=>java.once('exit',r)),new Promise(r=>setTimeout(r,2000))]);if(oldUrl===undefined)delete process.env.KARDA_JENA_URL;else process.env.KARDA_JENA_URL=oldUrl;if(oldSecret===undefined)delete process.env.OIDC_CLIENT_SECRET;else process.env.OIDC_CLIENT_SECRET=oldSecret;
  await admin.query('DELETE FROM karda_kb.graph_control WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM karda_kb.graph_asset_version WHERE asset_id=$1',[assetId]);await admin.query('DELETE FROM karda_kb.graph_asset WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM karda_kb.graph_index WHERE workspace_id=$1',[ws]);
  for(const table of ['semantic_relation_assertion','semantic_relation','semantic_release_source','semantic_release_review','semantic_release_head','semantic_event_receipt','semantic_release','semantic_review','semantic_compile_run','semantic_schema_version'])await admin.query('DELETE FROM karda_kb.'+table+' WHERE kb_id=$1',[kb]);
  await admin.query('DELETE FROM karda_kb.evidence WHERE assertion_id=$1',[assertion]);await admin.query('DELETE FROM karda_kb.assertion WHERE kb_id=$1',[kb]);await admin.query('DELETE FROM karda_kb.entity WHERE kb_id=$1',[kb]);await admin.query('DELETE FROM karda_kb.span WHERE document_id=$1',[doc]);await admin.query('DELETE FROM karda_kb.document WHERE kb_id=$1',[kb]);await admin.query('DELETE FROM karda_kb.knowledge_change_event WHERE workspace_id=$1',[ws]);await admin.query('DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1',[kb]);await admin.query('DELETE FROM karda_kb.knowledge_base WHERE id=$1',[kb]);if(member){await admin.query('DELETE FROM local_authz.member_role WHERE member_id=$1',[member]);await admin.query('DELETE FROM local_authz.member WHERE id=$1',[member]);}await service.end();await admin.end();await rm(folder,{recursive:true,force:true});
 }
});
