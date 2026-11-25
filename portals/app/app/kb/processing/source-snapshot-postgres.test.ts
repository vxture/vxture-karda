import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
import {Pool} from "pg";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {PrismaCommitTarget} from "./commit";
import {rawSourceFor} from "./runtime";
import {runPipeline,type CommittedChunk} from "./orchestrator";
import {PDF_MIME,DOCX_MIME,XLSX_MIME,PPTX_MIME,readSourceSnapshot,sourceHash} from "./source-snapshot";
import {normalizeSource} from "./source-normalizer";
import {verifiedSourceText} from "../semantic/source-text";
import {syntheticPdf,syntheticXlsxRanges,syntheticPptxStories,syntheticDocxGrid} from "./source-fixtures";
import {ContentService} from "../lib/content-service";
import {InMemoryContentStore} from "../lib/content-store";
import {InMemoryObjectStore} from "../storage/objectstore";
import {getPrismaClient} from "../../lib/db";
import {PostgresSemanticStore,PostgresFormalSemanticLoader} from "../semantic/store-postgres";
import {PostgresSemanticReader} from "../semantic/read-postgres";
import type {SemanticReleasePayload} from "../semantic/release-format";
import {PostgresSourceSearch} from "../retrieval/source-search-postgres";
import {parseSourceSearch} from "../retrieval/source-search";

test("source snapshots have identical fresh/upgrade DDL and immutable grants",()=>{
  const root=fileURLToPath(new URL("../../../../../deploy/database/ddl/",import.meta.url));
  const read=(name:string)=>readFileSync(`${root}/${name}`,"utf8").replace(/\r\n/g,"\n");
  const increment=read("incr/0018_document_text_snapshot.sql");
  for(const [section,file] of [["DOCUMENT TEXT SNAPSHOT","00_baseline.sql"],["DOCUMENT TEXT LOCKS","98_column_locks.sql"]]){
    const part=(text:string)=>text.slice(text.indexOf(`-- BEGIN ${section}`),text.indexOf(`-- END ${section}`)+`-- END ${section}`.length);
    const current=part(read(file)),old=part(increment);
    assert.ok(old.length>100);
    if(section==="DOCUMENT TEXT SNAPSHOT"){
      const withoutParser=(s:string)=>s.slice(0,s.indexOf("  CHECK ((mime=")>=0?s.indexOf("  CHECK ((mime="):s.indexOf("  CONSTRAINT document_text_snapshot_parser_check"));
      assert.equal(withoutParser(current),withoutParser(old));
      assert.match(read("incr/0021_docx_table_snapshot.sql"),/docx-body-tables-v2/);
      assert.match(read("incr/0022_xlsx_source_snapshot.sql"),/xlsx-literal-cells-v1/);
    }else assert.equal(old,current);
  }
});

const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("DOCX current table output commits and reloads under service-role CHECK, preserving historical rows and rejecting unknown parsers",{skip:!endpoint,timeout:30000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:endpoint});url.username="karda_svc";process.env.DATABASE_URL=url.toString();
  const service=new Pool({connectionString:url.toString()}),kb=randomUUID(),ws=randomUUID(),doc=randomUUID();
  const python=process.env.KARDA_KNOWLEDGE_PYTHON||(process.platform==="win32"?"python":"python3");
  const xml='<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Proof</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:tcPr><w:gridSpan w:val="2"/><w:vMerge/></w:tcPr><w:p/></w:tc></w:tr></w:tbl></w:body></w:document>';
  const bytes=execFileSync(python,["-I","-c",'import io,sys,zipfile; b=io.BytesIO(); z=zipfile.ZipFile(b,"w"); z.writestr("word/document.xml",sys.stdin.buffer.read()); z.close(); sys.stdout.buffer.write(b.getvalue())'],{input:Buffer.from(xml),timeout:10000,windowsHide:true});
  try{
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user','synthetic','table')",[kb,ws]);
    await admin.query("INSERT INTO karda_kb.document(id,kb_id,title,source,mime,content_hash,size_bytes) VALUES($1,$2,'table','upload',$3,$4,$5)",[doc,kb,DOCX_MIME,sourceHash(bytes),bytes.length]);
    const normalized=await normalizeSource(DOCX_MIME,bytes),target=new PrismaCommitTarget(doc);
    await target.commit([],null,normalized);
    const loaded=await readSourceSnapshot(async(sql,...values)=>(await service.query(sql,values)).rows,doc,1);
    assert.equal(loaded?.parserVersion,"docx-cell-grid-v4");assert.equal(loaded?.text,'Table 1 grid rows=2 columns=2\n\nTable 1 R1C1 rows=2 columns=2: "Proof"');
    const insert="INSERT INTO karda_kb.document_text_snapshot(document_id,document_version,content_hash,mime,parser_version,canonical_text,text_hash,locators) VALUES($1,$2,$3,$4,$5,$6,$7,$8)";
    const args=[doc,2,normalized.contentHash,DOCX_MIME,"docx-main-body-v1",normalized.text,normalized.textHash,JSON.stringify(normalized.locators)];
    await service.query(insert,args);
    await assert.rejects(service.query(insert,[...args.slice(0,1),3,...args.slice(2,4),"unknown",...args.slice(5)]),/check constraint/);
    await assert.rejects(service.query("DELETE FROM karda_kb.document_text_snapshot WHERE document_id=$1",[doc]),/permission denied/);
  }finally{
    await admin.query("DELETE FROM karda_kb.document_text_snapshot WHERE document_id=$1",[doc]);
    await admin.query("DELETE FROM karda_kb.document WHERE id=$1",[doc]);await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
    await (await getPrismaClient()).$disconnect();await service.end();await admin.end();
  }
});
for(const mime of [PDF_MIME,DOCX_MIME,XLSX_MIME,PPTX_MIME])test(`real ${mime} processing binds chunks, publication and exact evidence; stale input and late failure roll back`,{skip:!endpoint,timeout:60000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:endpoint,statement_timeout:10000});url.username="karda_svc";
  process.env.DATABASE_URL=url.toString();
  const service=new Pool({connectionString:url.toString(),statement_timeout:10000});
  const kb=randomUUID(),ws=randomUUID(),sub=`usr_${randomUUID()}`,bytes=mime===PDF_MIME?syntheticPdf(["Proof first","Proof last"]):mime===XLSX_MIME?syntheticXlsxRanges():mime===DOCX_MIME?syntheticDocxGrid():syntheticPptxStories(),objects=new InMemoryObjectStore();
  const identity={workspaceId:ws,sub,roles:[],productCode:"karda"};let member:string|undefined;
  const object=await objects.put(ws,kb,bytes),content=new ContentService(new InMemoryContentStore());
  const result=await content.createDocument({kbId:kb,title:"synthetic source",source:"upload",mime,
    contentHash:object.contentHash,storageRef:object.key,sizeBytes:bytes.length});
  assert.ok(result.ok);const doc={...result.value,id:randomUUID()},target=new PrismaCommitTarget(doc.id);let chunks:CommittedChunk[]=[];
  try{
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'synthetic')",[kb,ws,sub]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,mime,content_hash,storage_ref,size_bytes)
      VALUES($1,$2,'synthetic','upload',$3,$4,$5,$6)`,[doc.id,kb,mime,sourceHash(bytes),object.key,bytes.length]);
    const source=rawSourceFor(doc,objects);
    const outcome=await runPipeline({source,embeddingModel:null,embedder:{embed:async texts=>({vectors:texts.map(()=>[]),modelCode:"synthetic"})},
      target:{commit:async(rows,_model,snapshot)=>{chunks=rows;await target.commit(rows,null,snapshot);}}});
    assert.ok("done" in outcome);assert.equal(target.activeVersion(),1);
    const load=(version:number)=>readSourceSnapshot(async(sql,...values)=>(await service.query(sql,values)).rows,doc.id,version);
    const snapshot=(await load(1))!;assert.ok(snapshot);assert.equal(snapshot.text,(await normalizeSource(mime,bytes)).text);
    if(mime===DOCX_MIME){assert.equal(snapshot.parserVersion,"docx-cell-grid-v4");assert.match(snapshot.text,/R1C1 rows=2 columns=2/);assert.match(snapshot.text,/table1.*Nested support/);}
    if(mime===XLSX_MIME){assert.equal(snapshot.parserVersion,"xlsx-cell-ranges-v2");assert.match(snapshot.text,/merged A1:B2 anchor=A1 rows=2 columns=2/);}
    if(mime===PPTX_MIME){assert.equal(snapshot.parserVersion,"pptx-authored-stories-v3");assert.match(snapshot.text,/shape 3\/3/);assert.match(snapshot.text,/speaker notes part=/);}
    const excerptStart=mime===DOCX_MIME?snapshot.text.indexOf("Required merged proof"):mime===XLSX_MIME?snapshot.text.indexOf("Required"):mime===PPTX_MIME?snapshot.text.indexOf("Required speaker proof"):0,excerptEnd=excerptStart+5;
    assert.ok(excerptStart>=0);const excerpt=snapshot.text.slice(excerptStart,excerptEnd);
    assert.ok(chunks.every(c=>snapshot.text.slice(c.sourceRange.start,c.sourceRange.end).trim().length>0));
    assert.equal(verifiedSourceText({activeVersion:1,contentState:"indexed",contentHash:sourceHash(bytes),mime,normalized:snapshot},bytes),snapshot.text);
    // The identical normalized coordinates feed compiler input, publication and
    // the reader shared by Agent packages, knowledge pages and the graph.
    await admin.query("UPDATE karda_kb.document SET content_state='indexed' WHERE id=$1",[doc.id]);
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
    const left=randomUUID(),right=randomUUID(),assertion=randomUUID(),span=randomUUID(),evidence=randomUUID(),relation=randomUUID();
    await admin.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$3,'thing','left'),($2,$3,'thing','right')",[left,right,kb]);
    await admin.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'fact','Proof','indexed','verified')",[assertion,kb]);
    await admin.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,1,$4,$5,$3)",[span,doc.id,excerpt,excerptStart,excerptEnd]);
    await admin.query("INSERT INTO karda_kb.evidence(id,assertion_id,span_id,stance) VALUES($1,$2,$3,'supports')",[evidence,assertion,span]);
    const schema={namespace:"snapshot",schemaId:"proof",version:"1",entityTypes:["entity"],relationTypes:[{id:"requires",sourceTypes:["entity"],targetTypes:["entity"]}]};
    const payload:SemanticReleasePayload={format:"karda.semantic.release.v1",schema,entityTypes:[{kind:"thing",type:"entity"}],
      sources:[{kbId:kb,documentId:doc.id,version:1,contentHash:sourceHash(bytes)}],relations:[{id:relation,kbId:kb,schema,type:"requires",origin:"asserted",sourceId:left,targetId:right,assertionIds:[assertion]}]};
    const store=new PostgresSemanticStore(service,objects,async()=>true);
    const sourceCheck=await store.sourceReadiness(identity,kb);assert.equal(sourceCheck.readable,1);
    assert.equal(sourceCheck.items[0].parserVersion,snapshot.parserVersion);assert.equal(sourceCheck.items[0].characters,snapshot.text.length);
    const loaded=await store.loadCompilerSnapshot(identity,kb,payload);assert.equal(loaded.assertions[0].evidence[0].excerpt,excerpt);
    assert.equal((await store.createCompileTask(identity,kb,randomUUID())).duplicate,false,"binary sources enter the user compilation flow");
    const compile=await store.recordCompile(identity,kb,{taskKey:"a".repeat(64),configHash:"b".repeat(64),payload});
    await store.reviewRelation(identity,kb,{runId:compile.runId,relationId:relation,expectedRevision:0,decision:"accept",note:"Synthetic source proof checked"});
    await store.publish(identity,await store.plan(identity,kb,compile.runId,randomUUID(),0));
    const loader=new PostgresFormalSemanticLoader({schema,entityTypes:new Map([["thing","entity"]])});
    const reader=new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>loader.load(db,ids));
    const read=()=>reader.readPackage(identity,[kb],{seedIds:[left],maxHops:1,maxNodes:10,maxEdges:10});
    const pack=await read();assert.equal(pack.passages[0].excerpt,excerpt);assert.deepEqual(pack.evidence[0].pages,mime===PDF_MIME?[1]:undefined);
    const sourceSearch=new PostgresSourceSearch(service,objects,async()=>true);
    const searched=await sourceSearch.read(identity,parseSourceSearch({kb_ids:[kb],query:"Proof"}));
    assert.equal(searched.items.length,1);const hit=searched.items[0];
    assert.equal(hit.text,snapshot.text.slice(hit.start,hit.end));assert.deepEqual(hit.pages,mime===PDF_MIME?[1,2]:[]);
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
    assert.equal((await store.sourceReadiness(identity,kb)).blocked,1);
  }finally{
    for(const table of ["semantic_compile_task","semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion",
      "semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])
      await admin.query(`DELETE FROM karda_kb.${table} WHERE kb_id=$1`,[kb]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    const prisma=await getPrismaClient();await prisma.$disconnect();await service.end();await admin.end();
  }
});
