import test from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {PostgresSemanticStore,PostgresFormalSemanticLoader} from "./store-postgres";
import {PostgresSemanticReader} from "./read-postgres";
import {compileRelations} from "./compiler";
import {localCompileProfile} from "./compile-profile";
import {compareAuditReleases} from "./audit-history";
import {sourceHash} from "../processing/source-snapshot";
import {PostgresSourceSearch} from "../retrieval/source-search-postgres";
import {parseSourceSearch} from "../retrieval/source-search";

const endpoint=process.env.KARDA_PROVISION_TEST_DATABASE_URL;
/** Synthetic authored SOP; no customer documents, model verdict or business gold. */
test("SOP revision: raw withdrawal, impact, persisted unapproved candidates, new review/publication and shared knowledge refresh",{skip:!endpoint,timeout:60000},async()=>{
  const url=new URL(endpoint!);assert.ok(["localhost","127.0.0.1","[::1]"].includes(url.hostname));assert.equal(url.pathname,"/karda_p3_test");
  const admin=new Pool({connectionString:endpoint,statement_timeout:10000});url.username="karda_svc";
  const service=new Pool({connectionString:url.toString(),statement_timeout:10000}),kb=randomUUID(),ws=randomUUID(),sub=`usr_${randomUUID()}`;
  const doc=randomUUID(),procedure=randomUUID(),legacyStep=randomUUID(),revisedStep=randomUUID(),oldAssertion=randomUUID(),newAssertion=randomUUID();
  const identity={workspaceId:ws,sub,roles:[],productCode:"karda"},profile=localCompileProfile();
  let bytes=Buffer.from("Recovery SOP requires operator approval before restart.");let member:string|undefined;
  const objects={get:async()=>bytes},store=new PostgresSemanticStore(service,objects,async()=>true);
  const reader=()=>new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>new PostgresFormalSemanticLoader({schema:profile.schema,
    entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))}).load(db,ids));
  const read=()=>reader().readPackage(identity,[kb],{seedIds:[procedure],maxHops:2,maxNodes:20,maxEdges:20});
  const addEvidence=async(id:string,text:string,version:number)=>{
    const span=randomUUID();
    await admin.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'procedure',$3,'indexed','verified')",[id,kb,text]);
    await admin.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,$3,0,$4,$5)",[span,doc,version,text.length,text]);
    await admin.query("INSERT INTO karda_kb.evidence(id,assertion_id,span_id,stance) VALUES($1,$2,$3,'supports')",[randomUUID(),id,span]);
  };
  const compile=async(version:number,target:string,assertionId:string,taskKey:string)=>{
    const sources=[{kbId:kb,documentId:doc,version,contentHash:sourceHash(bytes)}];
    const snapshot=await store.loadCompilerSnapshot(identity,kb,{...profile,sources});
    const candidate=compileRelations(snapshot,[{type:"requires",source:{name:"Recovery SOP",type:"entity"},target:{name:target,type:"entity"},assertionIds:[assertionId]}]);
    assert.equal(candidate.rejected.length,0);assert.equal(candidate.payload.relations.length,1);
    const run=await store.recordCompile(identity,kb,{taskKey,configHash:"c".repeat(64),payload:candidate.payload});
    return {runId:run.runId,relationId:candidate.payload.relations[0].id};
  };
  try{
    member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'Synthetic recovery SOP')",[kb,ws,sub]);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,mime,storage_ref,size_bytes,content_hash,content_state,active_chunk_version)
      VALUES($1,$2,'Recovery SOP','upload','text/plain','sop',$3,$4,'indexed',1)`,[doc,kb,bytes.length,sourceHash(bytes)]);
    for(const [id,kind,name] of [[procedure,"procedure","Recovery SOP"],[legacyStep,"requirement","Operator approval"],[revisedStep,"requirement","Two-person approval"]])
      await admin.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$2,$3,$4)",[id,kb,kind,name]);
    await addEvidence(oldAssertion,bytes.toString(),1);
    const first=await compile(1,"Operator approval",oldAssertion,"1".repeat(64));
    assert.equal((await read()).edges.length,0,"persisted candidates remain unapproved drafts");
    await assert.rejects(store.preview(identity,kb,first.runId,randomUUID()),/semantic_review_required/);
    await store.reviewRelation(identity,kb,{runId:first.runId,relationId:first.relationId,expectedRevision:0,decision:"accept",note:"Synthetic SOP v1 verified"});
    await store.publish(identity,await store.plan(identity,kb,first.runId,randomUUID(),0));
    const oldKnowledge=await read();assert.equal(oldKnowledge.edges[0].targetId,legacyStep);assert.match(oldKnowledge.passages[0].excerpt,/operator approval/);

    // A revision updates raw bytes/version before any new semantic publication.
    bytes=Buffer.from("Recovery SOP requires two-person approval before restart.");
    await admin.query("UPDATE karda_kb.document SET active_chunk_version=2,content_hash=$2,size_bytes=$3 WHERE id=$1",[doc,sourceHash(bytes),bytes.length]);
    const invalidated=await read();assert.deepEqual(invalidated.edges,[]);assert.deepEqual(invalidated.passages,[]);
    assert.ok((await store.maintenance(identity,kb)).sources[0].issues.includes("source_changed"));
    const raw=await new PostgresSourceSearch(service,objects,async()=>true).read(identity,parseSourceSearch({kb_ids:[kb],query:"two-person"}));
    assert.equal(raw.items[0].documentVersion,2,"source-only retrieval is independent of semantic publication");
    await addEvidence(newAssertion,bytes.toString(),2);
    await admin.query("UPDATE karda_kb.assertion SET superseded_by=$2 WHERE id=$1",[oldAssertion,newAssertion]);
    const second=await compile(2,"Two-person approval",newAssertion,"2".repeat(64));
    const restarted=new PostgresSemanticStore(service,objects,async()=>true);
    assert.equal((await restarted.inspectCompile(identity,kb,second.runId)).relations[0].state,"pending","draft survives a new store instance");
    await assert.rejects(restarted.preview(identity,kb,second.runId,randomUUID()),/semantic_review_required/);
    assert.deepEqual((await read()).edges,[],"new candidate never restores old or new knowledge before review");
    await restarted.reviewRelation(identity,kb,{runId:second.runId,relationId:second.relationId,expectedRevision:0,decision:"accept",note:"Synthetic SOP v2 verified"});
    const preview=await restarted.preview(identity,kb,second.runId,randomUUID());
    assert.deepEqual(preview.changes.removed,[first.relationId]);assert.deepEqual(preview.changes.added,[second.relationId]);
    await restarted.submitPreview(identity,kb,preview);
    const knowledge=await read();assert.equal(knowledge.edges[0].targetId,revisedStep);assert.match(knowledge.passages[0].excerpt,/two-person approval/);
    const directory=await reader().readPackage(identity,[kb],{seedIds:[procedure],maxHops:2,maxNodes:20,maxEdges:20},true);
    assert.deepEqual(directory.edges,knowledge.edges);assert.deepEqual(directory.passages,knowledge.passages);
    assert.equal(knowledge.nodes.some(n=>n.id===legacyStep),false,"old step is absent from the current shared projection");
    const audit=await restarted.auditHistory(identity,kb);assert.equal(audit.replay,"complete");
    const diff=compareAuditReleases(audit.releases[1],audit.releases[0]);
    assert.deepEqual(diff.added,[second.relationId]);assert.deepEqual(diff.removed,[first.relationId]);assert.equal(diff.sourceChanges[0].after?.version,2);
    assert.deepEqual((await restarted.maintenance(identity,kb)).relations[0].issues,[]);
    await admin.query("UPDATE karda_kb.document SET content_state='archived' WHERE id=$1",[doc]);
    assert.deepEqual((await read()).edges,[]);assert.equal((await restarted.auditHistory(identity,kb)).replay,"complete","audit history does not reactivate withdrawn sources");
  }finally{
    for(const table of ["semantic_compile_task","semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion",
      "semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])
      await admin.query(`DELETE FROM karda_kb.${table} WHERE kb_id=$1`,[kb]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=$1",[kb]);
    if(member){await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]);await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]);}
    await service.end();await admin.end();
  }
});
