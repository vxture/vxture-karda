import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { Pool } from "pg";
import { PostgresSemanticStore, PostgresFormalSemanticLoader, semanticValueHash } from "./store-postgres";
import { PostgresSemanticReader } from "./read-postgres";
import { SEMANTIC_RELEASE_FORMAT, type SemanticReleasePayload } from "./release-format";
import { AtlasSemanticCandidateClient, runSemanticCompile } from "./compiler";

test("formal store canonical values and invalid input fail before platform/SQL", async () => {
  assert.equal(semanticValueHash({ b: 2, a: 1 }), semanticValueHash({ a: 1, b: 2 }));
  assert.notEqual(semanticValueHash([1, 2]), semanticValueHash([2, 1]));
  assert.throws(() => semanticValueHash({ bad: undefined }), /publication_invalid_json/);
  let admissions = 0;
  const pool = { connect: async () => { throw new Error("unexpected_sql"); } } as unknown as Pool;
  const store = new PostgresSemanticStore(pool, { get: async () => null }, async () => { admissions++; return true; });
  const identity = { workspaceId: randomUUID(), sub: `usr_${randomUUID()}`, roles: [], productCode: "karda" };
  await assert.rejects(store.reviewRelation(identity, randomUUID(), { runId: randomUUID(), relationId: randomUUID(),
    expectedRevision: 0, decision: "accept", note: " " }), /semantic_invalid_review/);
  await assert.rejects(store.recordCompile(identity, randomUUID(), { taskKey: "bad", configHash: "bad", payload: {} as SemanticReleasePayload }), /semantic_invalid_compile/);
  assert.equal(admissions, 0);
});

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("formal semantic store: compile/review/publish/read, replay, CAS, revocation, reconstruction and atomic rollback", {
  skip: !endpoint, timeout: 90000,
}, async () => {
  const url = new URL(endpoint!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint, statement_timeout: 10000 });
  url.username = "karda_svc";
  const service = new Pool({ connectionString: url.toString(), statement_timeout: 10000 });
  const kb = randomUUID(), other = randomUUID(), ws = randomUUID(), sub = `usr_${randomUUID()}`;
  const doc = randomUUID(), assertion = randomUUID(), span = randomUUID(), evidence = randomUUID();
  const left = randomUUID(), right = randomUUID(), relation = randomUUID();
  const identity = { workspaceId: ws, sub, roles: [], productCode: "karda" };
  const raw = Buffer.from("One\r\n\u4e2d\ud83d\ude00 proof.");
  const hash = createHash("sha256").update(raw).digest("hex");
  let bytes: Buffer | null = raw, platform = true, reads = 0;
  const objects = { get: async () => { reads++; return bytes; } };
  const admit = async () => platform;
  const store = new PostgresSemanticStore(service, objects, admit);
  const schema = { namespace: "store", schemaId: "objects", version: "1", entityTypes: ["object"],
    relationTypes: [{ id: "requires", sourceTypes: ["object"], targetTypes: ["object"] }] };
  const payload: SemanticReleasePayload = { format: SEMANTIC_RELEASE_FORMAT, schema,
    entityTypes: [{kind: "legacy", type: "object"}], sources: [{kbId: kb, documentId: doc, version: 2, contentHash: hash}],
    relations: [{id: relation, kbId: kb, type: "requires", schema, sourceId: left, targetId: right, assertionIds: [assertion], origin: "asserted"}] };
  const pinned = {schema, entityTypes: new Map([["legacy", "object"]])};
  const loader = new PostgresFormalSemanticLoader(pinned);
  const reader = () => new PostgresSemanticReader(service, objects, admit, (db, ids) => new PostgresFormalSemanticLoader(pinned).load(db, ids));
  const query = {seedIds: [left], maxHops: 1, maxNodes: 10, maxEdges: 10};
  const read = () => reader().read(identity, [kb], query);
  let member: string | undefined;
  const constraint = `semantic_injected_${randomUUID().replaceAll("-", "")}`;
  const role = async (code: string) => {
    await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1", [member]);
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code=$2", [member, code]);
  };
  try {
    member = (await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id", [ws,sub])).rows[0].id;
    await role("member");
    for (const id of [kb,other]) await admin.query(`INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name)
      VALUES($1,$2,'user',$3,$4)`, [id,ws,sub,`synthetic-store-${id}`]);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)", [ws,sub,kb]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,content_state,active_chunk_version,storage_ref,content_hash,mime,size_bytes)
      VALUES($1,$2,'synthetic','upload','indexed',2,'store-test-object',$3,'text/plain',$4)`, [doc,kb,hash,raw.length]);
    await admin.query(`INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$3,'legacy','left'),($2,$3,'legacy','right')`, [left,right,kb]);
    await admin.query(`INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state)
      VALUES($1,$2,'fact','synthetic','indexed','verified')`, [assertion,kb]);
    await admin.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,2,4,7,$3)", [span,doc,"\u4e2d\ud83d\ude00"]);
    await admin.query("INSERT INTO karda_kb.evidence(id,assertion_id,span_id,stance) VALUES($1,$2,$3,'supports')", [evidence,assertion,span]);
    assert.equal((await read()).edges.length, 0);
    let modelCalls=0;
    const specification={schema,entityTypes:payload.entityTypes,sources:payload.sources};
    const compilerResult=await runSemanticCompile(identity,kb,"synthetic-compile",{
      loadAuthorizedSnapshot:async(actor,id)=>({snapshot:await store.loadCompilerSnapshot(actor,id,specification),tenantId:randomUUID()}),
      candidates:new AtlasSemanticCandidateClient({chat:async request=>{
        modelCalls++;
        const supplied=JSON.parse(request.messages[1].content);
        assert.equal(supplied.assertions.length,1);assert.equal(supplied.assertions[0].evidence[0].excerpt,"\u4e2d\ud83d\ude00");
        return{content:JSON.stringify({relations:[{type:"requires",source:{name:"left",type:"object"},
          target:{name:"right",type:"object"},assertionIds:[assertion]}]})};
      }}),store,
    });
    assert.ok(compilerResult.runId);assert.equal(modelCalls,1);
    assert.equal((await read()).edges.length,0,"model candidates do not publish or approve knowledge");
    await role("readonly");
    await assert.rejects(store.loadCompilerSnapshot(identity,kb,specification),/semantic_write_denied/);
    await role("member");
    await admin.query("UPDATE karda_kb.assertion SET expires_at='2000-01-01' WHERE id=$1",[assertion]);
    assert.equal((await store.loadCompilerSnapshot(identity,kb,specification)).assertions.length,0,"expired supports never leave for the model");
    await admin.query("UPDATE karda_kb.assertion SET expires_at=NULL WHERE id=$1",[assertion]);
    await admin.query("UPDATE karda_kb.document SET content_state='archived' WHERE id=$1",[doc]);
    await assert.rejects(store.loadCompilerSnapshot(identity,kb,specification),/semantic_source_changed/);
    await admin.query("UPDATE karda_kb.document SET content_state='indexed' WHERE id=$1",[doc]);
    const taskKey = "a".repeat(64), configHash = "b".repeat(64);
    const compile = await store.recordCompile(identity,kb,{taskKey,configHash,payload});
    assert.equal(compile.duplicate, false);
    assert.deepEqual(await store.recordCompile(identity,kb,{taskKey,configHash,payload}), {...compile,duplicate:true});
    await assert.rejects(store.recordCompile(identity,kb,{taskKey,configHash:"c".repeat(64),payload}), /semantic_compile_task_conflict/);
    const incompatible = structuredClone(payload); incompatible.entityTypes = [{kind:"new",type:"object"}];
    await assert.rejects(store.recordCompile(identity,kb,{taskKey:"d".repeat(64),configHash,payload:incompatible}), /semantic_schema_version_conflict/);
    await assert.rejects(store.plan(identity,kb,compile.runId,randomUUID(),0), /semantic_review_required/);
    const review = (decision: "accept" | "reject" | "revise", expectedRevision: number) => store.reviewRelation(identity,kb,
      {runId:compile.runId,relationId:relation,expectedRevision,decision,note:"Synthetic integration verification only"});
    await review("reject",0);
    await assert.rejects(store.plan(identity,kb,compile.runId,randomUUID(),0), /semantic_review_required/);
    await review("accept",1);
    await assert.rejects(review("accept",0), /semantic_review_stale_revision/);
    const firstPlan = await store.plan(identity,kb,compile.runId,randomUUID(),0);
    const altered = structuredClone(firstPlan); (altered.payload as SemanticReleasePayload).relations[0].targetId = left;
    await assert.rejects(store.publish(identity,altered), /semantic_compile_payload_mismatch/);
    bytes = Buffer.from("mismatch");
    await assert.rejects(store.publish(identity,firstPlan), /semantic_source_changed/); bytes = raw;
    await admin.query("UPDATE karda_kb.assertion SET expires_at='2000-01-01' WHERE id=$1", [assertion]);
    await assert.rejects(store.publish(identity,firstPlan), /semantic_unsupported_relation/);
    await admin.query("UPDATE karda_kb.assertion SET expires_at=NULL WHERE id=$1", [assertion]);
    const receipts = await Promise.all([store.publish(identity,firstPlan),store.publish(identity,firstPlan)]);
    assert.equal(receipts[0].releaseId,receipts[1].releaseId);
    assert.equal(receipts.filter(r=>r.duplicate).length,1);
    const first = receipts[0];
    assert.equal((await read()).edges.length,1, "formal persisted tables feed the existing authorized reader");
    assert.equal((await reader().read(identity,[other],query)).edges.length,0);
    platform = false; const readsBefore = reads;
    await assert.rejects(store.publish(identity,firstPlan), /semantic_write_denied/);
    await assert.rejects(read(), /semantic_read_denied/); assert.equal(reads,readsBefore); platform = true;
    await role("readonly");
    await assert.rejects(store.plan(identity,kb,compile.runId,randomUUID(),1), /semantic_write_denied/);
    assert.equal((await read()).edges.length,1); await role("member");
    await admin.query("UPDATE karda_kb.document SET content_state='archived' WHERE id=$1", [doc]);
    assert.equal((await read()).edges.length,0);
    const staleSourcePlan = await store.plan(identity,kb,compile.runId,randomUUID(),1);
    await assert.rejects(store.publish(identity,staleSourcePlan), /semantic_source_changed/);
    await admin.query("UPDATE karda_kb.document SET content_state='indexed' WHERE id=$1", [doc]);
    const snapshot = await service.connect();
    try {
      await snapshot.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      assert.equal((await loader.load(snapshot,[kb])).relations.length,1);
      await review("reject",2);
      assert.equal((await loader.load(snapshot,[kb])).relations.length,1, "an existing reader keeps one consistent snapshot");
      await snapshot.query("COMMIT");
    } finally { await snapshot.query("ROLLBACK"); snapshot.release(); }
    assert.equal((await read()).edges.length,0, "next snapshot observes changed human decision without cache expiry");
    assert.equal((await store.publish(identity,firstPlan)).releaseId,first.releaseId, "historical receipt is not a current read grant");
    await review("accept",3);
    assert.equal((await read()).edges.length,0, "a newer acceptance requires a new release binding");
    const changedReview = await store.plan(identity,kb,compile.runId,randomUUID(),1);
    await review("accept",4);
    await assert.rejects(store.publish(identity,changedReview), /publication_authority_changed/);
    const plans = await Promise.all([store.plan(identity,kb,compile.runId,randomUUID(),1), store.plan(identity,kb,compile.runId,randomUUID(),1)]);
    const competing = await Promise.allSettled(plans.map(p=>store.publish(identity,p)));
    assert.equal(competing.filter(r=>r.status==="fulfilled").length,1);
    assert.match(String((competing.find(r=>r.status==="rejected") as PromiseRejectedResult).reason),/publication_stale_generation/);
    assert.equal((await read()).edges.length,1);
    const rebuilt = await store.recordCompile(identity,kb,{taskKey:"e".repeat(64),configHash,payload});
    assert.notEqual(rebuilt.runId,compile.runId);
    assert.equal(Number((await admin.query("SELECT count(*) FROM karda_kb.semantic_review WHERE kb_id=$1",[kb])).rows[0].count),5);
    const rebuiltPlan = await store.plan(identity,kb,rebuilt.runId,randomUUID(),2);
    const injection = randomUUID();
    assert.match(constraint,/^semantic_injected_[a-f0-9]{32}$/);
    await admin.query(`ALTER TABLE karda_kb.semantic_event_receipt ADD CONSTRAINT "${constraint}" CHECK(event_id<>'${injection}'::uuid) NOT VALID`);
    const failure = {...rebuiltPlan,eventId:injection};
    await assert.rejects(store.publish(identity,failure), {code:"23514"});
    assert.equal((await admin.query("SELECT generation FROM karda_kb.semantic_release_head WHERE kb_id=$1",[kb])).rows[0].generation,2);
    assert.equal(Number((await admin.query("SELECT count(*) FROM karda_kb.semantic_release WHERE kb_id=$1",[kb])).rows[0].count),2);
    await admin.query(`ALTER TABLE karda_kb.semantic_event_receipt DROP CONSTRAINT "${constraint}"`);
    await store.publish(identity,rebuiltPlan);
    assert.equal((await read()).edges.length,1, "reconstruction retains decisions and uses a new durable release");
    assert.equal((await store.publish(identity,firstPlan)).generation,1);
    assert.equal((await admin.query("SELECT generation FROM karda_kb.semantic_release_head WHERE kb_id=$1",[kb])).rows[0].generation,3);
    const current = (await admin.query("SELECT release_id FROM karda_kb.semantic_release_head WHERE kb_id=$1",[kb])).rows[0].release_id;
    await admin.query("UPDATE karda_kb.semantic_relation SET type='corrupt' WHERE kb_id=$1 AND release_id=$2",[kb,current]);
    await assert.rejects(read(),/semantic_corrupt_release/);
    await admin.query("UPDATE karda_kb.semantic_relation SET type='requires' WHERE kb_id=$1 AND release_id=$2",[kb,current]);
    assert.equal((await read()).edges.length,1);
    await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1",[kb]);
    assert.equal((await read()).edges.length,0);
  } finally {
    assert.match(constraint,/^semantic_injected_[a-f0-9]{32}$/);
    await admin.query(`ALTER TABLE karda_kb.semantic_event_receipt DROP CONSTRAINT IF EXISTS "${constraint}"`);
    for (const table of ["semantic_event_receipt","semantic_release_head","semantic_release_review","semantic_relation_assertion",
      "semantic_relation","semantic_release_source","semantic_release","semantic_compile_run","semantic_review","semantic_schema_version"])
      await admin.query(`DELETE FROM karda_kb.${table} WHERE kb_id=ANY($1::uuid[])`,[[kb,other]]);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=ANY($1::uuid[])",[[kb,other]]);
    if(member) { await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1",[member]); await admin.query("DELETE FROM local_authz.member WHERE id=$1",[member]); }
    await service.end(); await admin.end();
  }
});
