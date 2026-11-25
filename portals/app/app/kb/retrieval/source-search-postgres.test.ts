import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresSourceSearch} from "./source-search-postgres";
import {parseSourceSearch} from "./source-search";
import {sourceHash,PDF_MIME} from "../processing/source-snapshot";
import {syntheticPdf} from "../processing/source-fixtures";
import {normalizeSource} from "../processing/source-normalizer";

const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("source-only PostgreSQL search enforces live authority, exact PDF/native source versions and withdrawal without semantic publication",{skip:!endpoint,timeout:60000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:endpoint,statement_timeout:10000});url.username="karda_svc";
  const pool=new Pool({connectionString:url.toString(),statement_timeout:10000}),ws=randomUUID(),sub=`usr_${randomUUID()}`;
  const kb=randomUUID(),hidden=randomUUID(),other=randomUUID(),doc=randomUUID(),pdf=randomUUID();
  const native=Buffer.from("\u4e2d\u6587\ud83d\ude00 current source proof\r\nsecond line"),binary=syntheticPdf(["PDF proof first","","PDF proof last"]);
  const snapshot=await normalizeSource(PDF_MIME,binary),stored=new Map([["native",native],["pdf",binary]]);
  let allowed=true,reads=0,member:string|undefined;
  const reader=new PostgresSourceSearch(pool,{get:async key=>{reads++;return stored.get(key)??null;}},async()=>allowed);
  const identity={workspaceId:ws,sub,roles:[],productCode:"karda"};
  const input=parseSourceSearch({kb_ids:[kb,hidden,other],query:"proof"});
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    for(const [id,space,owner] of [[kb,ws,sub],[hidden,ws,"someone-else"],[other,randomUUID(),sub]]){
      await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,$4)",[id,space,owner,`source-search-${id}`]);
      await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[space,sub,id]);
    }
    for(const [id,library,mime,key,bytes] of [[doc,kb,"text/plain","native",native],[pdf,kb,PDF_MIME,"pdf",binary],[randomUUID(),hidden,"text/plain","hidden",native],[randomUUID(),other,"text/plain","other",native]] as const){
      await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,mime,storage_ref,content_hash,size_bytes,content_state,active_chunk_version)
        VALUES($1,$2,'source','upload',$3,$4,$5,$6,'indexed',1)`,[id,library,mime,key,sourceHash(bytes),bytes.length]);
    }
    await admin.query(`INSERT INTO karda_kb.document_text_snapshot(document_id,document_version,content_hash,mime,parser_version,text_hash,canonical_text,locators)
      VALUES($1,1,$2,$3,$4,$5,$6,$7::jsonb)`,[pdf,snapshot.contentHash,snapshot.mime,snapshot.parserVersion,snapshot.textHash,snapshot.text,JSON.stringify(snapshot.locators)]);
    const result=await reader.read(identity,input);
    assert.equal(result.mode,"source_only");assert.equal(result.items.length,2);assert.equal(result.partial,false);assert.equal(reads,2,"hidden libraries never cause object reads");
    const nativeHit=result.items.find(i=>i.documentId===doc)!;assert.equal(nativeHit.text,native.toString().replaceAll("\r\n","\n"));
    assert.deepEqual(result.items.find(i=>i.documentId===pdf)!.pages,[1,3]);
    assert.equal((await reader.read({...identity,productCode:"agent"},input)).items.length,0,"Karda attachment does not authorize another caller");
    allowed=false;await assert.rejects(reader.read(identity,input),/source_search_denied/);allowed=true;
    await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1",[kb]);
    assert.equal((await reader.read(identity,input)).items.length,0);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
    await admin.query("UPDATE karda_kb.document SET content_state='archived' WHERE id=$1",[doc]);
    assert.equal((await reader.read(identity,input)).items.length,1);
    await admin.query("UPDATE karda_kb.document SET content_state='indexed',verification_state='verified',expires_at=now()-interval '1 minute' WHERE id=$1",[doc]);
    assert.equal((await reader.read(identity,input)).items.length,1,"verification expiry is effective without a sweep");
    const all=await reader.read(identity,{...input,verificationFilter:"all"});assert.equal(all.items.find(i=>i.documentId===doc)!.verificationState,"stale");
    await admin.query("UPDATE karda_kb.document SET active_chunk_version=2 WHERE id=$1",[pdf]);
    const stale=await reader.read(identity,input);assert.equal(stale.items.length,0);assert.equal(stale.partial,true,"binary snapshots do not cross source versions");
    await admin.query("UPDATE karda_kb.document SET active_chunk_version=1,content_hash=$2 WHERE id=$1",[pdf,"f".repeat(64)]);
    assert.equal((await reader.read(identity,input)).items.length,0);
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);
    await assert.rejects(reader.read(identity,input),/source_search_denied/);
  }finally{
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=ANY($1::uuid[])",[[kb,hidden,other]]);
    if(member)await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);
    await pool.end();await admin.end();
  }
});
