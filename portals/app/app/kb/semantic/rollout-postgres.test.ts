import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresKnowledgeRollout,requireKnowledgeRollout} from "./rollout-postgres";

const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("workspace rollout: management authority, concurrent CAS, replay, immutable audit and next-read pause/resume",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:url.toString(),statement_timeout:5000});url.username="karda_svc";
  const service=new Pool({connectionString:url.toString(),statement_timeout:10000,max:4});
  const ws=randomUUID(),other=randomUUID(),sub=`usr_${randomUUID()}`,identity={workspaceId:ws,sub,roles:[],productCode:"karda"};
  const store=new PostgresKnowledgeRollout(service,async()=>true);let member:string|undefined;
  const check=async(workspace=ws)=>{const db=await service.connect();try{await requireKnowledgeRollout(db,workspace);}finally{db.release();}};
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await assert.rejects(store.handle(identity),/knowledge_rollout_denied/);await check();
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='administrator'",[member]);
    assert.equal((await store.handle(identity)).revision,0);
    const command={eventId:randomUUID(),expectedRevision:0,enabled:false,reason:"Synthetic rollout drill"};
    const results=await Promise.allSettled([store.handle(identity,command),store.handle(identity,{...command,eventId:randomUUID()})]);
    assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(results.filter(r=>r.status==="rejected"&&/knowledge_rollout_conflict/.test(String(r.reason))).length,1);
    const paused=await store.handle(identity);assert.equal(paused.enabled,false);await assert.rejects(check(),/knowledge_rollout_paused/);await check(other);
    const winning={...command,eventId:paused.history[0].eventId};assert.equal((await store.handle(identity,winning)).duplicate,true);
    await assert.rejects(store.handle(identity,{...winning,reason:"changed"}),/knowledge_rollout_conflict/);
    const resumed=await store.handle(identity,{eventId:randomUUID(),expectedRevision:1,enabled:true,reason:"Synthetic drill complete"});
    assert.equal(resumed.revision,2);assert.equal(resumed.enabled,true);await check();
    assert.deepEqual(resumed.history.map(e=>e.revision),[2,1]);
    assert.equal((await store.handle(identity,winning)).enabled,true,"old duplicate must not restore an earlier state");await check();
    await assert.rejects(service.query("UPDATE karda_kb.knowledge_rollout_event SET enabled=true WHERE workspace_id=$1",[ws]),{code:"42501"});
    await assert.rejects(service.query("DELETE FROM karda_kb.knowledge_rollout_event WHERE workspace_id=$1",[ws]),{code:"42501"});
    await assert.rejects(store.handle({...identity,workspaceId:other}),/knowledge_rollout_denied/);
    await assert.rejects(new PostgresKnowledgeRollout(service,async()=>false).handle(identity),/knowledge_rollout_denied/);
  }finally{await admin.query("DELETE FROM karda_kb.knowledge_rollout_event WHERE workspace_id=$1",[ws]);if(member)await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);await service.end();await admin.end();}
});
