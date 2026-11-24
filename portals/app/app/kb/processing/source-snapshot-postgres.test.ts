import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {PrismaCommitTarget} from "./commit";
import {rawSourceFor} from "./runtime";
import {runPipeline,type CommittedChunk} from "./orchestrator";
import {PDF_MIME,readSourceSnapshot,sourceHash} from "./source-snapshot";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticPdf} from "./source-fixtures";
import {ContentService} from "../lib/content-service";
import {InMemoryContentStore} from "../lib/content-store";
import {InMemoryObjectStore} from "../storage/objectstore";
import {getPrismaClient} from "../../lib/db";
import {PostgresSemanticStore,PostgresFormalSemanticLoader} from "../semantic/store-postgres";
import {PostgresSemanticReader} from "../semantic/read-postgres";
import type {SemanticReleasePayload} from "../semantic/release-format";

test("source snapshots have identical fresh/upgrade DDL and immutable grants",()=>{
  const root=fileURLToPath(new URL("../../../../../deploy/database/ddl/",import.meta.url));
  const read=(name:string)=>readFileSync(`${root}/${name}`,"utf8").replace(/\r\n/g,"\n");
  const increment=read("incr/0018_document_text_snapshot.sql");
  for(const [section,file] of [["DOCUMENT TEXT SNAPSHOT","00_baseline.sql"],["DOCUMENT TEXT LOCKS","98_column_locks.sql"]]){
    const part=(text:string)=>text.slice(text.indexOf(`-- BEGIN ${section}`),text.indexOf(`-- END ${section}`)+`-- END ${section}`.length);
    assert.ok(part(increment).length>100);assert.equal(part(increment),part(read(file)));
  }
});

const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("real PDF processing atomically binds chunks and immutable canonical text; stale input and late failure roll back",{skip:!endpoint,timeout:60000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:endpoint,statement_timeout:10000});url.username="karda_svc";
  process.env.DATABASE_URL=url.toString();
  const service=new Pool({connectionString:url.toString(),statement_timeout:10000});
  const kb=randomUUID(),ws=randomUUID(),sub=`usr_${randomUUID()}`,bytes=syntheticPdf(["Proof first","Proof last"]),objects=new InMemoryObjectStore();
  const identity={workspaceId:ws,sub,roles:[],productCode:"karda"};let member:string|undefined;
  const object=await objects.put(ws,kb,bytes),content=new ContentService(new InMemoryContentStore());
  const result=await content.createDocument({kbId:kb,title:"synthetic PDF",source:"upload",mime:PDF_MIME,
    contentHash:object.contentHash,storageRef:object.key,sizeBytes:bytes.length});
  assert.ok(result.ok);const doc={...result.value,id:randomUUID()},target=new PrismaCommitTarget(doc.id);let chunks:CommittedChunk[]=[];
  try{
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'synthetic')",[kb,ws,sub]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,mime,content_hash,storage_ref,size_bytes)
      VALUES($1,$2,'synthetic','upload',$3,$4,$5,$6)`,[doc.id,kb,PDF_MIME,sourceHash(bytes),object.key,bytes.length]);
    const source=rawSourceFor(doc,objects);
    const outcome=await runPipeline({source,embeddingModel:null,embedder:{embed:async texts=>({vectors:texts.map(()=>[]),modelCode:"synthetic"})},
      target:{commit:async(rows,_model,snapshot)=>{chunks=rows;await target.commit(rows,null,snapshot);}}});
    assert.ok("done" in outcome);assert.equal(target.activeVersion(),1);
    const load=(version:number)=>readSourceSnapshot(async(sql,...values)=>(await service.query(sql,values)).rows,doc.id,version);
    const snapshot=(await load(1))!;assert.ok(snapshot);assert.equal(snapshot.text,"Proof first\n\nProof last");
    assert.ok(chunks.every(c=>snapshot.text.slice(c.sourceRange.start,c.sourceRange.end).trim().length>0));
    assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime:PDF_MIME,normalized:snapshot},bytes),snapshot.text);
    // The identical normalized coordinates feed compiler input, publication and
    // the reader shared by Agent packages, knowledge pages and the graph.
    await admin.query("UPDATE karda_kb.document SET content_state='indexed' WHERE id=$1",[doc.id]);
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
    const left=randomUUID(),right=randomUUID(),assertion=randomUUID(),span=randomUUID(),evidence=randomUUID(),relation=randomUUID();
    await admin.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$3,'thing','left'),($2,$3,'thing','right')",[left,right,kb]);
    await admin.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'fact','Proof','indexed','verified')",[assertion,kb]);
    await admin.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,1,0,5,'Proof')",[span,doc.id]);
    await admin.query("INSERT INTO karda_kb.evidence(id,assertion_id,span_id,stance) VALUES($1,$2,$3,'supports')",[evidence,assertion,span]);
    const schema={namespace:"snapshot",schemaId:"proof",version:"1",entityTypes:["entity"],relationTypes:[{id:"requires",sourceTypes:["entity"],targetTypes:["entity"]}]};
    const payload:SemanticReleasePayload={format:"karda.semantic.release.v1",schema,entityTypes:[{kind:"thing",type:"entity"}],
      sources:[{kbId:kb,documentId:doc.id,version:1,contentHash:sourceHash(bytes)}],relations:[{id:relation,kbId:kb,schema,type:"requires",origin:"asserted",sourceId:left,targetId:right,assertionIds:[assertion]}]};
    const store=new PostgresSemanticStore(service,objects,async()=>true);
    const loaded=await store.loadCompilerSnapshot(identity,kb,payload);assert.equal(loaded.assertions[0].evidence[0].excerpt,"Proof");
    assert.equal((await store.createCompileTask(identity,kb,randomUUID())).duplicate,false,"binary sources enter the user compilation flow");
    const compile=await store.recordCompile(identity,kb,{taskKey:"a".repeat(64),configHash:"b".repeat(64),payload});
    await store.reviewRelation(identity,kb,{runId:compile.runId,relationId:relation,expectedRevision:0,decision:"accept",note:"Synthetic PDF proof checked"});
    await store.publish(identity,await store.plan(identity,kb,compile.runId,randomUUID(),0));
    const loader=new PostgresFormalSemanticLoader({schema,entityTypes:new Map([["thing","entity"]])});
    const reader=new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>loader.load(db,ids));
    const read=()=>reader.readPackage(identity,[kb],{seedIds:[left],maxHops:1,maxNodes:10,maxEdges:10});
    const pack=await read();assert.equal(pack.passages[0].excerpt,"Proof");assert.deepEqual(pack.evidence[0].pages,[1]);
    assert.deepEqual((await store.maintenance(identity,kb)).relations[0].issues,[]);
    await admin.query("UPDATE karda_kb.document SET content_state='archived' WHERE id=$1",[doc.id]);
    assert.equal((await read()).edges.length,0);await admin.query("UPDATE karda_kb.document SET content_state='indexed' WHERE id=$1",[doc.id]);
    assert.equal(await load(2),null);
    await assert.rejects(service.query("UPDATE karda_kb.document_text_snapshot SET canonical_text='changed' WHERE document_id=$1",[doc.id]),{code:"42501"});
    await assert.rejects(service.query("DELETE FROM karda_kb.document_text_snapshot WHERE document_id=$1",[doc.id]),{code:"42501"});
    await assert.rejects(target.commit([chunks[0],chunks[0]],null,snapshot));
    assert.equal(await load(2),null,"a late chunk uniqueness failure also rolls back the new snapshot");
    assert.equal((await admin.query("SELECT active_chunk_version FROM karda_kb.document WHERE id=$1",[doc.id])).rows[0].active_chunk_version,1);
    await admin.query("UPDATE karda_kb.document SET content_hash=$2 WHERE id=$1",[doc.id,"f".repeat(64)]);
    await assert.rejects(target.commit(chunks,null,snapshot),/source_content_changed/);assert.equal(await load(2),null);
    assert.equal((await read()).edges.length,0,"changed raw bytes or hash cannot reuse old normalized evidence");
  }finally{
    for(const table of ["semantic_compile_task","semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion",
      "semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])
      await admin.query(`DELETE FROM karda_kb.${table} WHERE kb_id=$1`,[kb]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    const prisma=await getPrismaClient();await prisma.$disconnect();await service.end();await admin.end();
  }
});
