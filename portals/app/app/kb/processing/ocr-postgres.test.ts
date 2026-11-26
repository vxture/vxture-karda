import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {readFileSync} from "node:fs";
import {PostgresOcrStore} from "./ocr-store";
import {ocrPayload} from "./pdf-ocr";
import {InMemoryObjectStore} from "../storage/objectstore";
import {sourceHash,readSourceSnapshot} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";

test("OCR draft schema and column grants agree for fresh and upgrade databases",()=>{
  const root=new URL("../../../../../deploy/database/ddl/",import.meta.url);
  const read=(name:string)=>readFileSync(new URL(name,root),"utf8").replace(/\r\n/g,"\n");
  for(const [section,file] of [["DOCUMENT OCR DRAFT","00_baseline.sql"],["DOCUMENT OCR LOCKS","98_column_locks.sql"]]){
    const part=(s:string)=>s.slice(s.indexOf(`-- BEGIN ${section}`),s.indexOf(`-- END ${section}`)+`-- END ${section}`.length);
    assert.equal(part(read(file)),part(read("incr/0031_document_ocr_draft.sql")));
  }
});
const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("OCR durable claim, confirmation CAS, source replacement and current permission boundary",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:url.toString()});url.username="karda_svc";
  const service=new Pool({connectionString:url.toString(),max:3}),objects=new InMemoryObjectStore();
  const ws=randomUUID(),kb=randomUUID(),doc=randomUUID(),sub=`usr_${randomUUID()}`,identity={workspaceId:ws,sub,roles:[],productCode:"karda"};
  const bytes=Buffer.from("%PDF-synthetic-no-provider"),stored=await objects.put(ws,kb,bytes);
  const store=new PostgresOcrStore(service,objects,async()=>true);let member:string|undefined;
  const command=()=>({action:"create" as const,id:randomUUID(),documentId:doc,modelCode:"synthetic-vision"});
  const payload=()=>ocrPayload({task:"ocr",modelCode:"synthetic-vision",pages:[{pageIndex:0,spans:[{bbox:[0,0,1,1],text:"Evidence \u4e2d\ud83d\ude00"}]}]},bytes,1,"synthetic-vision");
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='administrator'",[member]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'Synthetic OCR')",[kb,ws,sub]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,mime,storage_ref,content_hash,size_bytes,content_state)
      VALUES($1,$2,'OCR','upload','application/pdf',$3,$4,$5,'failed')`,[doc,kb,stored.key,stored.contentHash,bytes.length]);
    const first=command();const claims=await Promise.all([store.claim(identity,kb,first),store.claim(identity,kb,first)]);
    assert.equal(claims.filter(c=>c.claimed).length,1);
    const second=command();await store.claim(identity,kb,second);await store.settle(identity,kb,second,payload(),null);
    await store.settle(identity,kb,first,payload(),null);
    assert.equal((await store.browse(identity,kb,doc,first.id)).drafts[0].payload?.snapshot.text,"Evidence \u4e2d\ud83d\ude00");
    // A model draft cannot become a readable source before confirmation.
    assert.equal(await readSourceSnapshot(async(s,...v)=>(await service.query(s,v)).rows,doc,1),null);
    const receipt=await store.decide(identity,kb,{id:first.id,documentId:doc,action:"confirm"});assert.equal(receipt.version,1);
    assert.equal((await store.decide(identity,kb,{id:first.id,documentId:doc,action:"confirm"})).duplicate,true);
    const snap=await readSourceSnapshot(async(s,...v)=>(await service.query(s,v)).rows,doc,1);assert.ok(snap);
    assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:"application/pdf",normalized:snap},bytes),snap.text);
    assert.ok((await service.query("SELECT id FROM karda_kb.chunk WHERE document_id=$1 AND version=1 AND vector_ref IS NULL",[doc])).rowCount);
    await assert.rejects(store.decide(identity,kb,{id:second.id,documentId:doc,action:"confirm"}),/ocr_source_changed/);
    assert.equal((await store.browse(identity,kb,doc,second.id)).drafts[0].payload,null);
    await assert.rejects(service.query("UPDATE karda_kb.document_ocr_draft SET content_hash=$2 WHERE id=$1",[first.id,"a".repeat(64)]),/permission denied/);
    await assert.rejects(service.query("DELETE FROM karda_kb.document_ocr_draft WHERE id=$1",[first.id]),/permission denied/);
    const third=command();await store.claim(identity,kb,third);await store.settle(identity,kb,third,null,"ocr_atlas_refused");
    assert.equal((await store.browse(identity,kb,doc,third.id)).drafts[0].state,"failed");
    const fourth=command();await store.claim(identity,kb,fourth);await store.decide(identity,kb,{id:fourth.id,documentId:doc,action:"reject"});
    await assert.rejects(store.settle(identity,kb,fourth,payload(),null),/ocr_conflict/);
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);
    await assert.rejects(store.browse(identity,kb,doc,first.id),/ocr_denied/);
    await assert.rejects(store.decide(identity,kb,{id:first.id,documentId:doc,action:"confirm"}),/ocr_denied/);
  }finally{
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    await service.end();await admin.end();
  }
});
