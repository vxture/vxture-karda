import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresRebuild,candidateIndex} from "./rebuild-store";
import {chunkGeneral} from "./chunk";
import {sourceHash} from "./source-snapshot";
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("shadow rebuild: durable claims, atomic multi-document activation, exact baseline restore, CAS, source/config fences and authority",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";const service=new Pool({connectionString:url.toString(),max:3});
  const ws=randomUUID(),kb=randomUUID(),sub="usr_"+randomUUID(),docs=[randomUUID(),randomUUID()],oldIds=[randomUUID(),randomUUID()],id=randomUUID();
  const who={workspaceId:ws,sub,roles:[],productCode:"karda"},raw=Buffer.from("Source text for controlled rebuild."),hash=sourceHash(raw),objects={get:async()=>raw};let member:string|undefined;
  const store=new PostgresRebuild(service,objects,async()=>true);
  const command={action:"create" as const,id,kbId:kb,documentIds:docs,params:{targetTokens:32,maxTokens:64,overlap:0 as const},note:"Rebuild index"};
  const current=async()=>(await admin.query("SELECT c.id,c.document_id,c.version,c.text,e.vector FROM karda_kb.chunk c JOIN karda_kb.chunk_embedding e ON e.chunk_id=c.id WHERE c.document_id=ANY($1::uuid[]) ORDER BY c.document_id,c.ordinal",[docs])).rows;
  const transition=(action:"activate"|"revert"|"cancel",revision:number,runId=id)=>({action,id:runId,eventId:randomUUID(),expectedRevision:revision,note:"Reviewed batch"});
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name,embedding_model) VALUES($1,$2,'user',$3,'Rebuild','model-a')",[kb,ws,sub]);
    for(let i=0;i<docs.length;i++){
      await admin.query("INSERT INTO karda_kb.document(id,kb_id,title,source,content_state,active_chunk_version,storage_ref,content_hash,mime,size_bytes) VALUES($1,$2,'Proof','upload','indexed',1,'synthetic',$3,'text/plain',$4)",[docs[i],kb,hash,raw.length]);
      await admin.query("INSERT INTO karda_kb.chunk(id,document_id,version,ordinal,text,token_count,start_offset,end_offset,vector_ref) VALUES($1,$2,1,0,'Old chunk',2,0,9,'db:model-a')",[oldIds[i],docs[i]]);
      await admin.query("INSERT INTO karda_kb.chunk_embedding(chunk_id,model_code,dim,vector) VALUES($1,'model-a',2,'[1,0]')",[oldIds[i]]);
    }
    const baseline=await current();await store.create(who,command);assert.equal((await store.create(who,command)).duplicate,true);
    await assert.rejects(store.create(who,{...command,note:"Changed"}),/rebuild_conflict/);
    const first=await store.claim(who,id,docs[0]);assert.ok(first);assert.equal(await store.claim(who,id,docs[0]),null);
    await admin.query("UPDATE karda_kb.index_rebuild_item SET lease_until=now()-interval '1 second' WHERE run_id=$1 AND document_id=$2",[id,docs[0]]);
    const recovered=await new PostgresRebuild(service,objects,async()=>true).claim(who,id,docs[0]);assert.ok(recovered);assert.notEqual(recovered.lease,first.lease);
    const candidate=(ir:any)=>{const chunks=chunkGeneral(ir,command.params);return candidateIndex(chunks,{modelCode:"model-a",vectors:chunks.map(()=>[0,1])});};
    await assert.rejects(store.settle(who,id,docs[0],first.lease,candidate(first.ir),null),/rebuild_lease_changed/);
    await store.settle(who,id,docs[0],recovered.lease,candidate(recovered.ir),null);
    await assert.rejects(store.transition(who,transition("activate",0)),/rebuild_not_ready/);assert.deepEqual(await current(),baseline);
    const second=await store.claim(who,id,docs[1]);assert.ok(second);await store.settle(who,id,docs[1],second.lease,candidate(second.ir),null);
    assert.deepEqual(await current(),baseline,"candidate construction never changes serving chunks");
    await admin.query("UPDATE karda_kb.document SET content_hash=$2 WHERE id=$1",[docs[1],"f".repeat(64)]);
    await assert.rejects(store.transition(who,transition("activate",0)),/rebuild_source_changed|rebuild_index_changed/);assert.deepEqual(await current(),baseline,"all documents checked before any replacement");
    await admin.query("UPDATE karda_kb.document SET content_hash=$2 WHERE id=$1",[docs[1],hash]);
    const activation=transition("activate",0);await store.transition(who,activation);assert.equal((await store.transition(who,activation)).duplicate,true);
    const active=await current();assert.ok(active.every(r=>!oldIds.includes(r.id)&&r.version===1));
    await assert.rejects(store.transition(who,transition("revert",0)),/rebuild_conflict/);
    await admin.query("UPDATE karda_kb.knowledge_base SET embedding_model='other' WHERE id=$1",[kb]);await assert.rejects(store.transition(who,transition("revert",1)),/rebuild_config_changed/);
    await admin.query("UPDATE karda_kb.knowledge_base SET embedding_model='model-a' WHERE id=$1",[kb]);
    await admin.query("UPDATE karda_kb.chunk SET text='Concurrent index' WHERE id=$1",[active[0].id]);await assert.rejects(store.transition(who,transition("revert",1)),/rebuild_index_changed/);
    await admin.query("UPDATE karda_kb.chunk SET text=$2 WHERE id=$1",[active[0].id,active[0].text]);
    await store.transition(who,transition("revert",1));assert.deepEqual(await current(),baseline,"original chunk IDs, text and vectors restored");
    assert.equal((await store.browse(who,kb,id)).runs[0].events.length,2);
    await assert.rejects(service.query("UPDATE karda_kb.index_rebuild_item SET baseline='[]' WHERE run_id=$1",[id]),/permission denied/);
    await assert.rejects(service.query("DELETE FROM karda_kb.index_rebuild_event WHERE run_id=$1",[id]),/permission denied/);
    const cancelled=randomUUID();await store.create(who,{...command,id:cancelled});const live=await store.claim(who,cancelled,docs[0]);assert.ok(live);await store.transition(who,transition("cancel",0,cancelled));
    await assert.rejects(store.settle(who,cancelled,docs[0],live.lease,candidate(live.ir),null),/rebuild_lease_changed/);
    await assert.rejects(store.browse({...who,workspaceId:randomUUID()},kb),/rebuild_denied/);
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await assert.rejects(store.browse(who,kb),/rebuild_denied/);
  }finally{
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    await service.end();await admin.end();
  }
});
