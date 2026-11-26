import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresProfiles} from "./profile-store";
import {PostgresSemanticStore,PostgresFormalSemanticLoader} from "./store-postgres";
import {PostgresSemanticReader} from "./read-postgres";
import {profileHash} from "./profile-authority";
import {localCompileProfile} from "./compile-profile";
import type {CompileProfile} from "./profile-config";
const sampleProfile=():CompileProfile=>({schema:{namespace:"karda.config",schemaId:"domain-relations",version:"1",entityTypes:["object"],
  relationTypes:[{id:"requires",sourceTypes:["object"],targetTypes:["object"]}]},entityTypes:[{kind:"thing",type:"object"}]});
import {sourceHash} from "../processing/source-snapshot";
import type {SemanticReleasePayload} from "./release-format";
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("versioned configuration activates with CAS, freezes tasks and retains published custom-schema consumption after rollback",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";const service=new Pool({connectionString:url.toString(),max:4});
  const ws=randomUUID(),kb=randomUUID(),other=randomUUID(),sub=`usr_${randomUUID()}`,doc=randomUUID(),a=randomUUID(),span=randomUUID(),left=randomUUID(),right=randomUUID();
  const who={workspaceId:ws,sub,roles:[],productCode:"karda"},raw=Buffer.from("Approval required."),hash=sourceHash(raw),objects={get:async()=>raw};let member:string|undefined;
  const profiles=new PostgresProfiles(service,async()=>true),store=new PostgresSemanticStore(service,objects,async()=>true);
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$3,'user',$4,'Configuration'),($2,$3,'user',$4,'Other')",[kb,other,ws,sub]);
    assert.equal((await profiles.browse(who,kb)).revision,0);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,content_state,active_chunk_version,storage_ref,content_hash,mime,size_bytes)
      VALUES($1,$2,'Proof','upload','indexed',1,'synthetic',$3,'text/plain',$4)`,[doc,kb,hash,raw.length]);
    await admin.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$3,'thing','left'),($2,$3,'thing','right')",[left,right,kb]);
    await admin.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'fact','Approval required','indexed','verified')",[a,kb]);
    await admin.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,1,0,$3,$4)",[span,doc,raw.length,raw.toString()]);
    await admin.query("INSERT INTO karda_kb.evidence(assertion_id,span_id,stance) VALUES($1,$2,'supports')",[a,span]);
    const oldTask=randomUUID();await store.createCompileTask(who,kb,oldTask,[doc]);
    const id=randomUUID(),definition=sampleProfile(),save={action:"save" as const,id,title:"Domain profile",definition};
    await profiles.mutate(who,kb,save);assert.equal((await profiles.mutate(who,kb,save)).duplicate,true);
    await assert.rejects(profiles.mutate(who,kb,{...save,id:randomUUID()}),/profile_version_conflict/);
    const activation={action:"activate" as const,eventId:randomUUID(),profileId:id,expectedRevision:0,note:"Use domain vocabulary"};
    const attempts=await Promise.allSettled([profiles.mutate(who,kb,activation),profiles.mutate(who,kb,{...activation,eventId:randomUUID()})]);
    assert.equal(attempts.filter(r=>r.status==="fulfilled").length,1);
    const actual=(await profiles.browse(who,kb));assert.equal(actual.current.schema.namespace,"karda.config");
    const newTask=randomUUID();await store.createCompileTask(who,kb,newTask,[doc]);
    const tasks=(await admin.query("SELECT id,snapshot FROM karda_kb.semantic_compile_task WHERE kb_id=$1",[kb])).rows;
    assert.equal(tasks.find(t=>t.id===oldTask).snapshot.schema.namespace,"karda.local");assert.equal(tasks.find(t=>t.id===newTask).snapshot.schema.namespace,"karda.config");
    const payload:SemanticReleasePayload={format:"karda.semantic.release.v1",...definition,sources:[{kbId:kb,documentId:doc,version:1,contentHash:hash}],
      relations:[{id:randomUUID(),kbId:kb,schema:definition.schema,type:"requires",sourceId:left,targetId:right,assertionIds:[a],origin:"asserted"}]};
    const run=await store.recordCompile(who,kb,{taskKey:"a".repeat(64),configHash:"b".repeat(64),payload});
    await store.reviewRelation(who,kb,{runId:run.runId,relationId:payload.relations[0].id,expectedRevision:0,decision:"accept",note:"Synthetic review"});
    await store.publish(who,await store.plan(who,kb,run.runId,randomUUID(),0));
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
    const reader=new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>new PostgresFormalSemanticLoader().load(db,ids));
    const read=()=>reader.readPackage(who,[kb],{seedIds:[left],maxHops:1,maxNodes:10,maxEdges:10});
    assert.equal((await read()).edges.length,1);assert.equal((await read()).schema.namespace,"karda.config");
    await profiles.mutate(who,kb,{...activation,eventId:randomUUID(),profileId:null,expectedRevision:1,note:"Restore default for new work"});
    assert.equal(profileHash((await profiles.browse(who,kb)).current),profileHash(localCompileProfile()));
    assert.equal((await read()).edges.length,1,"configuration rollback does not reinterpret published knowledge");
    const blank=sampleProfile();blank.schema.version="2";blank.entityTypes=[{kind:"unmapped",type:"object"}];const badId=randomUUID();
    await profiles.mutate(who,kb,{...save,id:badId,definition:blank});
    await assert.rejects(profiles.mutate(who,kb,{...activation,eventId:randomUUID(),profileId:badId,expectedRevision:2}),/profile_entity_kind_unmapped/);
    await assert.rejects(profiles.mutate(who,other,{...activation,eventId:randomUUID(),expectedRevision:0}),/profile_version_conflict/);
    for(const table of ["compile_profile_version","compile_profile_activation"])await assert.rejects(service.query(`DELETE FROM karda_kb.${table} WHERE kb_id=$1`,[kb]),/permission denied/);
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await assert.rejects(profiles.browse(who,kb),/profile_denied/);
  }finally{
    for(const table of ["semantic_compile_task","semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion","semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])
      await admin.query(`DELETE FROM karda_kb.${table} WHERE kb_id=ANY($1::uuid[])`,[[kb,other]]);
    // Activation references its immutable profile; delete it before FK cascades.
    await admin.query("DELETE FROM karda_kb.compile_profile_activation WHERE kb_id=ANY($1::uuid[])",[[kb,other]]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=ANY($1::uuid[])",[[kb,other]]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    await service.end();await admin.end();
  }
});
