import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresPilots} from "./pilot-postgres";
import {PostgresSemanticStore} from "./store-postgres";
import {localCompileProfile} from "./compile-profile";
import {sourceHash} from "../processing/source-snapshot";
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("pilot workflow: same-snapshot real retrieval, immutable observations, current-window review, CAS close/reopen, attachment and rollout revocation",{skip:!endpoint,timeout:30000},async()=>{
 const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
 const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";const service=new Pool({connectionString:url.toString(),max:3});
 const ws=randomUUID(),kb=randomUUID(),sub="usr_"+randomUUID(),doc=randomUUID(),a=randomUUID(),span=randomUUID(),left=randomUUID(),right=randomUUID(),relation=randomUUID(),id=randomUUID();
 const who={workspaceId:ws,sub,roles:[],productCode:"karda"},raw=Buffer.from("Approval required."),hash=sourceHash(raw),objects={get:async()=>raw};let member:string|undefined;
 const pilots=new PostgresPilots(service,objects,async()=>true),semantic=new PostgresSemanticStore(service,objects,async()=>true);
 const create={action:"create" as const,id,kbId:kb,title:"Approval pilot",query:"Approval",topK:10,note:"Compare current knowledge"};
 const compare=(observationId=randomUUID())=>({action:"compare" as const,kbId:kb,id,observationId});
 const transition=(action:"close"|"reopen",expectedRevision:number)=>({action,kbId:kb,id,eventId:randomUUID(),expectedRevision,note:"Operator decision"});
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
  await semantic.publish(who,await semantic.plan(who,kb,run.runId,randomUUID(),0));
  await pilots.mutate(who,create);assert.equal((await pilots.mutate(who,create) as any).duplicate,true);await assert.rejects(pilots.mutate(who,{...create,query:"Different"}),/pilot_conflict/);
  const command=compare(),first:any=await pilots.mutate(who,command);assert.equal(first.baseline.items.length,1);assert.equal(first.published.edges.length,1);assert.equal(first.summary.sharedDocuments,1);
  assert.equal((await new PostgresPilots(service,objects,async()=>true).mutate(who,command) as any).fingerprint,first.fingerprint);
  const observations=(await pilots.browse(who,kb,id)).observations;assert.equal(observations.length,1);assert.deepEqual(Object.keys(observations[0]).sort(),["created_at","fingerprint","id","summary"]);
  const review={action:"review" as const,kbId:kb,id,observationId:command.observationId,eventId:randomUUID(),expectedRevision:0,verdict:"prefer_published" as const,note:"Evidence is useful"};
  await admin.query("UPDATE karda_kb.document SET title='Updated proof' WHERE id=$1",[doc]);
  await assert.rejects(pilots.mutate(who,review),/pilot_window_changed/);await assert.rejects(pilots.mutate(who,command),/pilot_window_changed/);
  const fresh=compare();await pilots.mutate(who,fresh);const actual={...review,observationId:fresh.observationId};await pilots.mutate(who,actual);assert.equal((await pilots.mutate(who,actual) as any).duplicate,true);
  await assert.rejects(pilots.mutate(who,transition("close",0)),/pilot_conflict/);
  await admin.query("UPDATE karda_kb.assertion SET verification_state='stale' WHERE id=$1",[a]);await assert.rejects(pilots.mutate(who,transition("close",1)),/pilot_window_changed/);
  await admin.query("UPDATE karda_kb.assertion SET verification_state='verified' WHERE id=$1",[a]);await pilots.mutate(who,transition("close",1));
  await pilots.mutate(who,transition("reopen",2));assert.equal((await pilots.browse(who,kb,id)).cases[0].state,"open");assert.equal((await pilots.browse(who,kb,id)).history.length,3);
  await admin.query("UPDATE karda_kb.document SET mime='application/octet-stream' WHERE id=$1",[doc]);
  const partial=compare(),diagnostic:any=await pilots.mutate(who,partial);assert.equal(diagnostic.summary.sourcePartial,true);
  await assert.rejects(pilots.mutate(who,{...actual,eventId:randomUUID(),expectedRevision:3,observationId:partial.observationId}),/pilot_incomplete/);
  await admin.query("UPDATE karda_kb.document SET mime='text/plain' WHERE id=$1",[doc]);
  await assert.rejects(service.query("UPDATE karda_kb.pilot_case SET query='forged' WHERE id=$1",[id]),/permission denied/);await assert.rejects(service.query("DELETE FROM karda_kb.pilot_observation WHERE case_id=$1",[id]),/permission denied/);
  await assert.rejects(service.query("UPDATE karda_kb.pilot_event SET note='forged' WHERE case_id=$1",[id]),/permission denied/);
  await admin.query("INSERT INTO karda_kb.knowledge_rollout_event(workspace_id,revision,event_id,enabled,reason,changed_by) VALUES($1,1,$2,false,'Pause',$3)",[ws,randomUUID(),sub]);await assert.rejects(pilots.mutate(who,compare()),/knowledge_rollout_paused/);
  await admin.query("DELETE FROM karda_kb.knowledge_rollout_event WHERE workspace_id=$1",[ws]);
  await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1",[kb]);await assert.rejects(pilots.mutate(who,compare()),/pilot_scope_changed/);
  assert.equal((await pilots.browse(who,kb,id)).cases.length,1,"own record metadata can be managed without attachment");
  await assert.rejects(pilots.browse({...who,workspaceId:randomUUID()},kb),/pilot_denied/);
  await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await assert.rejects(pilots.browse(who,kb),/pilot_denied/);
 }finally{
  await admin.query("DELETE FROM karda_kb.knowledge_rollout_event WHERE workspace_id=$1",[ws]);
  for(const table of ["semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion","semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])await admin.query("DELETE FROM karda_kb."+table+" WHERE kb_id=$1",[kb]);
  await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
  if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
  await service.end();await admin.end();
 }
});
