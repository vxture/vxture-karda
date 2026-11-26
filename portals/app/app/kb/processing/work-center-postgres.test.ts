import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresWorkCenter} from "./work-center-postgres";
import {PostgresOperations} from "../semantic/operations-postgres";
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("real work center combines ledgers after authority filtering, pages equal timestamps and rejects changed anchors",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";const service=new Pool({connectionString:url.toString()});
  const ws=randomUUID(),sub=`usr_${randomUUID()}`,otherSub=`usr_${randomUUID()}`,kb=randomUUID(),otherKb=randomUUID(),doc=randomUUID(),otherDoc=randomUUID();let member:string|undefined;
  const who={workspaceId:ws,sub,roles:[],productCode:"karda"},reader=new PostgresWorkCenter(service,async()=>true),operations=new PostgresOperations(service,async()=>true);
  const taskIds:string[]=[];
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$3,'user',$4,'Work'),($2,$3,'user',$5,'Private')",[kb,otherKb,ws,sub,otherSub]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,mime,content_hash,size_bytes,content_state)
      VALUES($1,$2,'Visible source','upload','application/pdf',$5,10,'indexed'),($3,$4,'Hidden source','upload','application/pdf',$5,10,'indexed')`,[doc,kb,otherDoc,otherKb,"a".repeat(64)]);
    for(let n=0;n<33;n++){
      const id=randomUUID();taskIds.push(id);
      await admin.query(`INSERT INTO karda_kb.processing_task(id,document_id,kb_id,state,created_at) VALUES($1,$2,$3,'failed','2026-11-26T12:00:00.123456Z')`,[id,doc,kb]);
    }
    await admin.query("INSERT INTO karda_kb.processing_task(document_id,kb_id,state) VALUES($1,$2,'failed')",[otherDoc,otherKb]);
    const compile=randomUUID(),foreignCompile=randomUUID(),ocr=randomUUID(),expired=randomUUID();
    for(const [id,actor] of [[compile,sub],[foreignCompile,otherSub]])await admin.query(`INSERT INTO karda_kb.semantic_compile_task(id,kb_id,created_by,snapshot,snapshot_hash,state)
      VALUES($1,$2,$3,'{}',$4,'needs_review')`,[id,kb,actor,"a".repeat(64)]);
    await admin.query(`INSERT INTO karda_kb.semantic_compile_task(id,kb_id,created_by,snapshot,snapshot_hash,state,lease_id,lease_until)
      VALUES($1,$2,$3,'{}',$4,'running',$5,now()-interval '1 minute')`,[expired,kb,sub,"a".repeat(64),randomUUID()]);
    await admin.query(`INSERT INTO karda_kb.document_ocr_draft(id,kb_id,document_id,content_hash,base_version,model_code,created_by,state)
      VALUES($1,$2,$3,$4,0,'synthetic',$5,'running')`,[ocr,kb,doc,"a".repeat(64),sub]);
    const maintenance=randomUUID();await operations.mutate(who,{action:"create",eventId:randomUUID(),taskId:maintenance,kbId:kb,targetType:"library",targetId:kb,title:"Manual work",note:"Private note must not appear",state:"open",priority:"normal",dueDate:null});
    const first=await reader.read(who,{});assert.equal(first.items.length,30);assert.ok(first.nextBefore);
    assert.deepEqual(new Set(first.counts.map(c=>c.kind)),new Set(["processing","compilation","ocr","maintenance"]));
    assert.equal(first.counts.reduce((n,c)=>n+c.count,0),37);assert.equal(first.libraries.length,1);
    assert.ok(!JSON.stringify(first).includes("Private note"));assert.ok(first.items.every(i=>i.id!==foreignCompile));
    const second=await reader.read(who,{before:first.nextBefore!});assert.equal(second.items.length,7);
    assert.equal(new Set([...first.items,...second.items].map(i=>i.id)).size,37,"equal PostgreSQL microsecond timestamps page exactly");
    assert.ok(first.items.some(i=>i.id===expired&&i.rawState==="lease_expired"&&i.state==="attention"));
    await assert.rejects(reader.read(who,{kind:"processing",before:first.nextBefore!}),/work_cursor_changed/);
    const scoped=await reader.read(who,{kind:"processing",state:"attention"});assert.equal(scoped.counts.reduce((n,c)=>n+c.count,0),33);
    await assert.rejects(reader.read(who,{kbId:otherKb}),/work_denied/);
    const anchor=JSON.parse(Buffer.from(first.nextBefore!,"base64url").toString());
    await admin.query("DELETE FROM karda_kb.processing_task WHERE id=$1",[anchor.id]);
    await assert.rejects(reader.read(who,{before:first.nextBefore!}),/work_cursor_changed/);
    await admin.query("UPDATE karda_kb.knowledge_base SET deleted_at=now() WHERE id=$1",[kb]);assert.equal((await reader.read(who,{})).items.length,0);
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await assert.rejects(reader.read(who,{}),/work_denied/);
    await assert.rejects(new PostgresWorkCenter(service,async()=>false).read(who,{}),/work_denied/);
  }finally{
    await admin.query("DELETE FROM karda_kb.semantic_compile_task WHERE kb_id IN ($1,$2)",[kb,otherKb]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id IN ($1,$2)",[kb,otherKb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    await service.end();await admin.end();
  }
});
