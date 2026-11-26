import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresOperations} from "./operations-postgres";
import type {OperationCommand,OperationRow} from "./operations";

const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("maintenance work lifecycle: shared current ownership, CAS/replay, filters/history, immutable audit and revocation",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";
  const service=new Pool({connectionString:url.toString(),max:3}),store=new PostgresOperations(service,async()=>true);
  const ws=randomUUID(),sub=`usr_${randomUUID()}`,otherSub=`usr_${randomUUID()}`,kb=randomUUID(),otherKb=randomUUID(),taskId=randomUUID();
  const identity={workspaceId:ws,sub,roles:[],productCode:"karda"};let member:string|undefined;
  const create:OperationCommand={action:"create",eventId:randomUUID(),taskId,kbId:kb,targetType:"library",targetId:kb,title:"Synthetic work item",note:"Manual issue",
    state:"open",priority:"high",dueDate:"2026-01-01"};
  const update=(row:OperationRow,state:OperationRow["state"],note="Processing note"):OperationCommand=>({action:"update",eventId:randomUUID(),taskId:row.taskId,expectedRevision:row.revision,
    title:row.title,state,priority:row.priority,dueDate:row.dueDate,note});
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='administrator'",[member]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$3,'user',$4,'Mine'),($2,$3,'user',$5,'Other')",[kb,otherKb,ws,sub,otherSub]);
    assert.equal((await store.mutate(identity,create)).revision,1);assert.equal((await store.mutate(identity,create)).duplicate,true);
    await assert.rejects(store.mutate(identity,{...create,title:"different"}),/operations_conflict/);
    await assert.rejects(store.mutate(identity,{...create,eventId:randomUUID(),taskId:randomUUID(),kbId:otherKb,targetId:otherKb}),/operations_denied/);
    let row=(await store.browse(identity,{taskId})).tasks[0];
    const command=update(row,"in_progress"),competitor=update(row,"blocked");
    const result=await Promise.allSettled([store.mutate(identity,command),store.mutate(identity,competitor)]);
    assert.equal(result.filter(r=>r.status==="fulfilled").length,1);assert.equal(result.filter(r=>r.status==="rejected").length,1);
    row=(await store.browse(identity,{taskId})).tasks[0];assert.equal(row.revision,2);
    assert.equal((await store.browse(identity,{overdue:true,priority:"high"})).tasks.length,1);
    await store.mutate(identity,update(row,"resolved","Source repaired separately"));row=(await store.browse(identity,{taskId})).tasks[0];
    assert.equal((await store.browse(identity,{overdue:true})).tasks.length,0);
    await assert.rejects(store.mutate(identity,update(row,"in_progress")),/operations_conflict/);
    await store.mutate(identity,update(row,"open","Reopen after new issue"));
    for(let n=0;n<20;n++){row=(await store.browse(identity,{taskId})).tasks[0];await store.mutate(identity,update(row,"open",`Follow-up ${n}`));}
    const history=await store.browse(identity,{taskId});assert.equal(history.history.length,20);assert.ok(history.nextHistoryBefore);
    const older=await store.browse(identity,{taskId,historyBefore:history.nextHistoryBefore!});assert.equal(older.tasks[0].revision,24);assert.equal(older.history.at(-1)!.revision,1);
    for(let n=0;n<51;n++)await store.mutate(identity,{...create,eventId:randomUUID(),taskId:randomUUID()});
    const page=await store.browse(identity,{});assert.equal(page.tasks.length,50);assert.ok(page.nextBefore);
    const next=await store.browse(identity,{before:page.nextBefore!});assert.equal(next.tasks.length,2);assert.ok(next.tasks.every(t=>!page.tasks.some(p=>p.taskId===t.taskId)));
    await assert.rejects(service.query("UPDATE karda_kb.maintenance_task_event SET payload='{}' WHERE task_id=$1",[taskId]),/permission denied/);
    await assert.rejects(service.query("DELETE FROM karda_kb.maintenance_task_event WHERE task_id=$1",[taskId]),/permission denied/);
    await admin.query("UPDATE karda_kb.knowledge_base SET deleted_at=now() WHERE id=$1",[kb]);
    assert.equal((await store.browse(identity,{})).tasks.length,0);await assert.rejects(store.browse(identity,{taskId}),/operations_not_found/);
    await admin.query("UPDATE karda_kb.knowledge_base SET deleted_at=NULL WHERE id=$1",[kb]);
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);
    await assert.rejects(store.browse(identity,{}),/operations_denied/);await assert.rejects(store.mutate(identity,create),/operations_denied/);
  }finally{
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id IN ($1,$2)",[kb,otherKb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    await service.end();await admin.end();
  }
});
