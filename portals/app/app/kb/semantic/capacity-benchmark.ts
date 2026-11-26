import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {readFileSync,readdirSync} from "node:fs";
import {cpus,platform,totalmem} from "node:os";
import {performance} from "node:perf_hooks";
import {Pool} from "pg";
import {PostgresSemanticStore,PostgresFormalSemanticLoader,semanticValueHash} from "./store-postgres";
import {PostgresSemanticReader,type KnowledgePackage,type PublishedRelationInput} from "./read-postgres";
import {localCompileProfile} from "./compile-profile";
import {SEMANTIC_RELEASE_FORMAT,type SemanticReleasePayload,semanticDefinitionKey} from "./release-format";
import {sourceHash} from "../processing/source-snapshot";

export function capacityControlUrl(value:string):URL{
  const url=new URL(value);
  if(!["postgres:","postgresql:"].includes(url.protocol)||!["127.0.0.1","localhost","[::1]"].includes(url.hostname)||
    url.pathname!=="/karda_scale_control"||url.search||url.hash)throw Error("isolated_capacity_control_required");
  return url;
}
export function capacityStats(values:number[]){
  if(!values.length||values.some(v=>!Number.isFinite(v)||v<0))throw Error("invalid_capacity_samples");
  const sorted=[...values].sort((a,b)=>a-b);
  return {samplesMs:values,p50Ms:sorted[Math.ceil(sorted.length*.5)-1],p95Ms:sorted[Math.ceil(sorted.length*.95)-1],maxMs:sorted.at(-1)!};
}

/** Isolated synthetic service-role experiment. Never contacts production, Atlas or object storage. */
export async function benchmarkKnowledgeCapacity(endpoint:string,samples=10){
  const controlUrl=capacityControlUrl(endpoint);if(!Number.isInteger(samples)||samples<2||samples>30)throw Error("invalid_capacity_samples");
  const control=new Pool({connectionString:controlUrl.toString(),max:1,statement_timeout:30000});
  const name=`karda_capacity_${randomUUID().replaceAll("-","")}`;
  let admin:Pool|undefined,service:Pool|undefined,created=false;
  const started=new Date().toISOString();
  try{
    await control.query(`CREATE DATABASE "${name}"`);created=true;
    const dbUrl=new URL(controlUrl);dbUrl.pathname=`/${name}`;
    admin=new Pool({connectionString:dbUrl.toString(),max:2,statement_timeout:30000});
    const ddl=new URL("../../../../../deploy/database/ddl/",import.meta.url);
    const readDdl=(file:string)=>readFileSync(new URL(file,ddl),"utf8");
    await admin.query(readDdl("00_baseline.sql"));await admin.query(readDdl("97_service_role.sql"));
    for(const file of readdirSync(new URL("incr/",ddl)).filter(f=>f.endsWith(".sql")).sort())await admin.query(readDdl(`incr/${file}`));
    await admin.query(readDdl("98_column_locks.sql"));
    dbUrl.username="karda_svc";dbUrl.password="";
    service=new Pool({connectionString:dbUrl.toString(),max:4,statement_timeout:30000});
    const ws=randomUUID(),sub=`usr_${randomUUID()}`,identity={workspaceId:ws,sub,roles:[],productCode:"karda"};
    const member=(await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id",[ws,sub])).rows[0].id;
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='administrator'",[member]);
    const profile=localCompileProfile(),raw=Buffer.from("Synthetic capacity evidence requires approval."),hash=sourceHash(raw);
    const objects={get:async()=>raw},store=new PostgresSemanticStore(service,objects,async()=>true);
    const loader=new PostgresFormalSemanticLoader({schema:profile.schema,entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))});
    const reader=new PostgresSemanticReader(service,objects,async()=>true,(db,ids)=>loader.load(db,ids));
    const fixtures:{kb:string;doc:string;relations:number;payload:SemanticReleasePayload}[]=[];
    async function seed(count:number){
      const kb=randomUUID(),doc=randomUUID(),assertion=randomUUID(),span=randomUUID(),nodes=Array.from({length:Math.min(count,200)},()=>randomUUID());
      await admin!.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,$4)",[kb,ws,sub,`synthetic-capacity-${fixtures.length}`]);
      await admin!.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
      await admin!.query("INSERT INTO karda_kb.document(id,kb_id,title,source,mime,storage_ref,size_bytes,content_hash,content_state,active_chunk_version) VALUES($1,$2,'Synthetic source','upload','text/plain','synthetic-local',$3,$4,'indexed',1)",[doc,kb,raw.length,hash]);
      await admin!.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'fact','Synthetic approval requirement','indexed','verified')",[assertion,kb]);
      await admin!.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,1,0,$3,$4)",[span,doc,raw.length,raw.toString()]);
      await admin!.query("INSERT INTO karda_kb.evidence(id,assertion_id,span_id,stance) VALUES($1,$2,$3,'supports')",[randomUUID(),assertion,span]);
      await admin!.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) SELECT id,$2,'thing','Synthetic entity '||ordinal FROM unnest($1::uuid[]) WITH ORDINALITY AS t(id,ordinal)",[nodes,kb]);
      const payload:SemanticReleasePayload={format:SEMANTIC_RELEASE_FORMAT,...profile,sources:[{kbId:kb,documentId:doc,version:1,contentHash:hash}],
        relations:Array.from({length:count},(_,i)=>({id:randomUUID(),kbId:kb,schema:{namespace:profile.schema.namespace,schemaId:profile.schema.schemaId,version:profile.schema.version},type:"requires",sourceId:nodes[i%nodes.length],targetId:nodes[(i+1)%nodes.length],assertionIds:[assertion],origin:"asserted"}))};
      const setupStart=performance.now(),compile=await store.recordCompile(identity,kb,{taskKey:semanticValueHash(kb),configHash:semanticValueHash(profile),payload});
      // Synthetic authored verdicts only. Uses the same subject binding as the formal store, never model or business acceptance.
      const input:PublishedRelationInput={...payload,entityTypes:new Map(profile.entityTypes.map(t=>[t.kind,t.type]))};
      const reviews=payload.relations.map(relation=>({subject:`relation/${relation.id}`,hash:semanticValueHash({definition:semanticDefinitionKey(input),sources:input.sources,relation})}));
      await admin!.query(`INSERT INTO karda_kb.semantic_review(kb_id,subject_key,revision,decision,subject_hash,reviewer_sub,note)
        SELECT $1,r.subject,1,'accept',r.hash,$3,'Synthetic capacity verdict' FROM jsonb_to_recordset($2::jsonb) AS r(subject text,hash text)`,[kb,JSON.stringify(reviews),sub]);
      const plan=await store.plan(identity,kb,compile.runId,randomUUID(),0);await store.publish(identity,plan);
      fixtures.push({kb,doc,relations:count,payload});return {fixture:fixtures.at(-1)!,setupMs:performance.now()-setupStart};
    }
    const small=await seed(100),large=await seed(400);
    for(let i=1;i<12;i++)await seed(400);
    const all=fixtures.slice(1),query={seedIds:["directory"],maxHops:1,maxNodes:500,maxEdges:1000};
    const read=(kbIds:string[],cursor?:string,search=false)=>reader.readPackage(identity,kbIds,{...query,...(cursor!==undefined?{pageCursor:cursor}:{})},true,false,undefined,search?{query:"approval",topK:20,pageCursor:""}:undefined);
    async function measure(run:()=>Promise<KnowledgePackage>,expected:number,concurrency:number){
      const firstStart=performance.now(),first=await run(),firstObservedMs=performance.now()-firstStart;assert.equal(first.edges.length,expected);
      const times:number[]=[];
      for(let i=0;i<samples;i++)await Promise.all(Array.from({length:concurrency},async()=>{const start=performance.now(),result=await run();const elapsed=performance.now()-start;assert.equal(result.edges.length,expected);assert.equal(result.sourceStatus,"complete");times.push(elapsed);}));
      return {concurrency,firstObservedMs,responseBytes:Buffer.byteLength(JSON.stringify(first)),...capacityStats(times)};
    }
    const cases=[];
    const workloads:[string,typeof fixtures][]=[["one-library-100",[small.fixture]],["one-library-400",[large.fixture]],["twelve-libraries-4800",all]];
    for(const [label,scope] of workloads){
      const ids=scope.map(f=>f.kb),total=scope.reduce((n,f)=>n+f.relations,0);
      const initial=await read(ids,"");const seen=new Set(initial.edges.map(e=>e.id));let next=initial.directoryPage!.nextCursor,pages=1;
      while(next){const page=await read(ids,next);for(const edge of page.edges){assert.ok(!seen.has(edge.id));seen.add(edge.id);}next=page.directoryPage!.nextCursor;pages++;}
      assert.equal(seen.size,total);
      cases.push({label,libraries:ids.length,inputRelations:total,directoryPages:pages,coveredRelations:seen.size,
        directory:[await measure(()=>read(ids,""),initial.edges.length,1),await measure(()=>read(ids,""),initial.edges.length,4)],
        facts:[await measure(()=>read(ids,undefined,true),20,1),await measure(()=>read(ids,undefined,true),20,4)]});
    }
    // Explicitly measure refusal rather than presenting the row ceiling as single-publication capacity.
    let oversizedCode="";try{semanticValueHash({...large.fixture.payload,relations:Array.from({length:1000},(_,i)=>({...large.fixture.payload.relations[i%400],id:randomUUID()}))});}
    catch(error){oversizedCode=error instanceof Error?error.message:"unknown";}assert.equal(oversizedCode,"publication_payload_limit");
    const ids=all.map(f=>f.kb),before=await read(ids,"");assert.ok(before.directoryPage!.nextCursor);
    await admin.query("UPDATE karda_kb.document SET content_state='archived' WHERE id=$1",[all[0].doc]);
    const withdrawalStart=performance.now();await assert.rejects(read(ids,before.directoryPage!.nextCursor!),/semantic_directory_changed/);
    const after=await read(ids,"");assert.ok(after.edges.every(e=>e.kbId!==all[0].kb));
    assert.ok(after.evidence.every(e=>e.documentId!==all[0].doc));
    await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1",[all[1].kb]);
    const narrowed=await read(ids,undefined,true);assert.equal(narrowed.search!.eligibleRelations,4000);assert.ok(narrowed.edges.every(e=>e.kbId!==all[1].kb));
    return {format:"karda.capacity-benchmark.v1",started,finished:new Date().toISOString(),scope:"isolated_synthetic_formal_store",samplesPerLane:samples,
      environment:{node:process.version,platform:platform(),cpu:cpus()[0]?.model,logicalCpus:cpus().length,memoryBytes:totalmem(),postgres:(await admin.query("SHOW server_version")).rows[0].server_version},
      setup:{first100Ms:small.setupMs,first400Ms:large.setupMs},cases,checks:{directoryNoGapsOrDuplicates:true,withdrawalAndAttachmentRefusal:true,withdrawalCheckMs:performance.now()-withdrawalStart,oversizedCode},
      limitations:["Synthetic shared-source evidence; not business quality or a production SLA.","Local in-memory object bytes and admitted platform callback; no network object store, RP/OBO gateway or model latency.","First observed latency is not controlled cold-cache latency. Concurrent samples include service-pool waiting.","Results cover this machine and workload only. Row ceilings do not override publication byte or structural budgets."]};
  }finally{
    await service?.end();await admin?.end();
    if(created){assert.match(name,/^karda_capacity_[a-f0-9]{32}$/);await control.query(`DROP DATABASE "${name}"`);}
    await control.end();
  }
}
