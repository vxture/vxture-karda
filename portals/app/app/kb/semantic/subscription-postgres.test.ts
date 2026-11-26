import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresSubscriptions} from "./subscription-store";
import {PostgresSemanticStore} from "./store-postgres";
import {localCompileProfile} from "./compile-profile";
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("durable consumer checkpoints: current authority, revision coalescing, acknowledgement CAS, metadata replay and cancellation",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";const service=new Pool({connectionString:url.toString(),max:3});
  const ws=randomUUID(),kb=randomUUID(),sub=`usr_${randomUUID()}`,who={workspaceId:ws,sub,roles:[],productCode:"karda"},id=randomUUID();let member:string|undefined;
  const objects={get:async()=>null},store=new PostgresSubscriptions(service,objects,async()=>true),semantic=new PostgresSemanticStore(service,objects,async()=>true);
  const command={action:"create" as const,id,name:"Synthetic consumer",window:{kb_id:kb,entity_ids:[]}};
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'Consumer')",[kb,ws,sub]);
    await assert.rejects(store.handle(who,command),/subscription_scope_changed/);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
    await store.handle(who,command);assert.equal(((await store.handle(who,command)) as any).duplicate,true);
    await assert.rejects(store.handle(who,{...command,name:"Different"}),/subscription_conflict/);
    const first:any=await store.handle(who,{action:"poll",id});assert.equal(first.sequence,1);assert.equal(first.ackSequence,0);assert.equal(first.events.length,1);
    const again:any=await new PostgresSubscriptions(service,objects,async()=>true).handle(who,{action:"poll",id});assert.equal(again.sequence,1,"process restart and unchanged poll do not create events");
    const ack={action:"ack" as const,id,sequence:1,revision:first.revision,expectedAck:0};await store.handle(who,ack);assert.equal(((await store.handle(who,ack)) as any).duplicate,true);
    const profile=localCompileProfile();profile.schema.version="2";
    const run=await semantic.recordCompile(who,kb,{taskKey:"a".repeat(64),configHash:"b".repeat(64),payload:{format:"karda.semantic.release.v1",...profile,relations:[],sources:[]}});
    await semantic.publish(who,await semantic.plan(who,kb,run.runId,randomUUID(),0));
    const changed:any=await store.handle(who,{action:"poll",id});assert.equal(changed.sequence,2);assert.notEqual(changed.revision,first.revision);
    await assert.rejects(store.handle(who,ack),/subscription_revision_changed/);
    await assert.rejects(store.handle(who,{...ack,sequence:2,revision:changed.revision,expectedAck:0}),/subscription_conflict/);
    await store.handle(who,{...ack,sequence:2,revision:changed.revision,expectedAck:1});
    const replay:any=await store.handle(who,{action:"poll",id,after:0});assert.deepEqual(replay.events.map((e:any)=>e.sequence),[1,2]);assert.equal(replay.replay,"revision_metadata_only");
    assert.ok(replay.events.every((e:any)=>Object.keys(e).sort().join()==="observedAt,revision,sequence"));
    await assert.rejects(store.handle({...who,productCode:"runos"},{action:"poll",id}),/subscription_not_found/);
    await assert.rejects(service.query("UPDATE karda_kb.knowledge_subscription SET window_request='{}' WHERE id=$1",[id]),/permission denied/);
    await assert.rejects(service.query("DELETE FROM karda_kb.knowledge_subscription_event WHERE subscription_id=$1",[id]),/permission denied/);
    await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1",[kb]);
    await assert.rejects(store.handle(who,{action:"poll",id}),/subscription_scope_changed/);await assert.rejects(store.handle(who,{...ack,sequence:2,revision:changed.revision,expectedAck:2}),/subscription_scope_changed/);
    await store.handle(who,{action:"cancel",id});await store.handle(who,{action:"cancel",id});await assert.rejects(store.handle(who,{action:"poll",id}),/subscription_cancelled/);
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await assert.rejects(store.handle(who,{action:"list"}),/subscription_denied/);
  }finally{
    await admin.query("DELETE FROM karda_kb.knowledge_subscription WHERE workspace_id=$1",[ws]);
    for(const table of ["semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion","semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])
      await admin.query(`DELETE FROM karda_kb.${table} WHERE kb_id=$1`,[kb]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    await service.end();await admin.end();
  }
});
