import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresSemanticReader, type PublishedRelationInput } from "./read-postgres";
import type { NeighborhoodQuery } from "./contracts";
import { PostgresPublicationProtocol } from "./publication-postgres";
import { PostgresSemanticReleaseLoader } from "./release-postgres";
import { SEMANTIC_RELEASE_FORMAT } from "./release-format";
import { createReleaseTestFixture } from "./release-test-fixture";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("semantic native-text adapter: live roles, attachment/tenant scope, source versions and consistent snapshots", { skip: !endpoint, timeout: 30000 }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint, statement_timeout: 5000 });
  url.username = "karda_svc";
  const service = new Pool({ connectionString: url.toString(), statement_timeout: 5000 });
  const ws = randomUUID(), otherWs = randomUUID(), sub = `usr_${randomUUID()}`;
  const namespace = `semantic_protocol_test_${randomUUID().replaceAll("-", "")}`;
  const kb = randomUUID(), hiddenKb = randomUUID(), otherKb = randomUUID(), secondKb=randomUUID();
  const doc = randomUUID(), assertion = randomUUID(), span = randomUUID(), evidence = randomUUID();
  const left = randomUUID(), right = randomUUID();
  const raw = Buffer.from("One\r\n\u4e2d\ud83d\ude00 proof.");
  const hash = createHash("sha256").update(raw).digest("hex");
  const identity = { workspaceId: ws, sub, roles: [], productCode: "karda" };
  const query: NeighborhoodQuery = { seedIds: [left], maxHops: 1, maxNodes: 10, maxEdges: 10 };
  const schema = { namespace: "test", schemaId: "proof", version: "1", entityTypes: ["object"],
    relationTypes: [{ id: "requires", sourceTypes: ["object"], targetTypes: ["object"] }] };
  const published: PublishedRelationInput = { schema, entityTypes: new Map([["legacy", "object"]]),
    sources: [{ kbId: kb, documentId: doc, version: 2, contentHash: hash }],
    relations: [{ id: randomUUID(), kbId: kb, schema, sourceId: left, targetId: right,
      type: "requires", assertionIds: [assertion], origin: "asserted" }] };
  let platformAllowed = true, reads = 0, loadedKbIds: string[] = [], stored: Buffer | null = raw;
  let afterSnapshot: (() => Promise<void>) | undefined;
  const phases:{name:string;ms:number}[]=[];
  const reader = new PostgresSemanticReader(service, { get: async () => { reads++; return stored; } },
    async () => platformAllowed, async (db, ids) => {
      loadedKbIds = ids;
      // A real service-role transaction must stay read-only.
      assert.equal((await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "on");
      if (afterSnapshot) { const effect = afterSnapshot; afterSnapshot = undefined; await effect(); }
      return published;
    },(name,ms)=>{phases.push({name,ms});});
  const read = () => reader.read(identity, [kb, hiddenKb, otherKb], query);
  let member: string | undefined;
  try {
    member = (await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id", [ws, sub])).rows[0].id;
    const grant = () => admin.query(`INSERT INTO local_authz.member_role(member_id,role_id)
      SELECT $1,id FROM local_authz.role WHERE role_code='readonly'`, [member]);
    assert.equal((await grant()).rowCount, 1);
    for (const [id, workspace, owner] of [[kb, ws, sub], [hiddenKb, ws, `usr_${randomUUID()}`], [otherKb, otherWs, sub]]) {
      await admin.query(`INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name)
        VALUES($1,$2,'user',$3,$4)`, [id, workspace, owner, `semantic-adapter-${id}`]);
      await admin.query(`INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id)
        VALUES($1,$2,'karda',$3)`, [workspace, sub, id]);
    }
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,content_state,active_chunk_version,
      storage_ref,content_hash,mime,size_bytes) VALUES($1,$2,'source','upload','indexed',2,'test-object',$3,'text/plain',$4)`,
      [doc, kb, hash, raw.length]);
    await admin.query(`INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state,as_of)
      VALUES($1,$2,'fact','supported','indexed','verified','2099-01-01')`, [assertion, kb]);
    await admin.query(`INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$3,'legacy','left'),($2,$3,'legacy','right')`, [left, right, kb]);
    await admin.query(`INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt)
      VALUES($1,$2,2,4,7,$3)`, [span, doc, "\u4e2d\ud83d\ude00"]);
    await admin.query(`INSERT INTO karda_kb.evidence(id,assertion_id,span_id,stance) VALUES($1,$2,$3,'supports')`, [evidence, assertion, span]);
    assert.equal((await read()).edges.length, 1, "as_of does not become validFrom");
    assert.deepEqual(phases.map(p=>p.name),["admission","pool","authority","published","records","sources","projection","enrichment"]);
    assert.ok(phases.every(p=>Number.isFinite(p.ms)&&p.ms>=0));
    const observed=await new PostgresSemanticReader(service,{get:async()=>raw},async()=>true,async()=>published,()=>{throw Error("diagnostic_failure");}).readPackage(identity,[kb],query);
    assert.equal(observed.edges.length,1);assert.equal(Object.hasOwn(observed,"phases"),false,"timings are not delivered knowledge");
    assert.deepEqual(loadedKbIds, [kb]);
    assert.equal(reads, 1, "hidden libraries never cause object reads");
    platformAllowed = false;
    await assert.rejects(read(), /semantic_read_denied/);
    assert.equal(reads, 1);
    platformAllowed = true;

    await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1", [kb]);
    assert.equal((await read()).edges.length, 0);
    assert.equal(reads, 1);
    await admin.query(`INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)`, [ws, sub, kb]);
    for (const state of ["deleted", "archived", "processing"]) {
      await admin.query("UPDATE karda_kb.document SET content_state=$2 WHERE id=$1", [doc, state]);
      assert.equal((await read()).edges.length, 0);
    }
    await admin.query("UPDATE karda_kb.document SET content_state='indexed',active_chunk_version=3 WHERE id=$1", [doc]);
    assert.equal((await read()).edges.length, 0);
    await admin.query("UPDATE karda_kb.document SET active_chunk_version=2 WHERE id=$1", [doc]);
    for (const unavailable of [null, Buffer.from("corrupted")]) {
      stored = unavailable;
      const result = await read();
      assert.equal(result.edges.length, 0); assert.equal(result.sourceStatus, "partial");
    }
    stored = raw;
    const frozenSources = published.sources;
    published.sources = [];
    assert.equal((await read()).sourceStatus, "partial", "missing release manifest is never reconstructed from live metadata");
    assert.equal((await read()).edges.length, 0);
    published.sources = [...frozenSources, ...frozenSources];
    await assert.rejects(read(), /semantic_invalid_manifest/);
    published.sources = frozenSources;
    // A changed current object with an unchanged quoted substring must still
    // fail the release's frozen source hash, even if activeVersion was not bumped.
    stored = Buffer.from("One\r\n\u4e2d\ud83d\ude00 other.");
    const changedHash = createHash("sha256").update(stored).digest("hex");
    await admin.query("UPDATE karda_kb.document SET content_hash=$2,size_bytes=$3 WHERE id=$1", [doc, changedHash, stored.length]);
    assert.equal((await read()).edges.length, 0);
    stored = raw;
    await admin.query("UPDATE karda_kb.document SET content_hash=$2,size_bytes=$3 WHERE id=$1", [doc, hash, raw.length]);
    await admin.query("UPDATE karda_kb.span SET excerpt='incorrect' WHERE id=$1", [span]);
    assert.equal((await read()).edges.length, 0);
    await admin.query("UPDATE karda_kb.span SET excerpt=$2 WHERE id=$1", [span, "\u4e2d\ud83d\ude00"]);
    await admin.query("UPDATE karda_kb.assertion SET expires_at=now()-interval '1 second' WHERE id=$1", [assertion]);
    assert.equal((await read()).edges.length, 0);
    await admin.query("UPDATE karda_kb.assertion SET expires_at=NULL WHERE id=$1", [assertion]);
    published.entityTypes = new Map();
    assert.equal((await read()).edges.length, 0, "unmapped legacy kinds cannot imply ontology types");
    published.entityTypes = new Map([["legacy", "object"]]);

    afterSnapshot = async () => { await admin.query("UPDATE karda_kb.document SET content_state='deleted' WHERE id=$1", [doc]); };
    assert.equal((await read()).edges.length, 1, "in-flight read stays on the already authorized DB snapshot");
    assert.equal((await read()).edges.length, 0, "next read immediately sees withdrawal without a sweep");
    await admin.query("UPDATE karda_kb.document SET content_state='indexed' WHERE id=$1", [doc]);
    afterSnapshot = async () => { await admin.query("DELETE FROM local_authz.member_role WHERE member_id=$1", [member]); };
    assert.equal((await read()).edges.length, 1);
    await assert.rejects(read(), /semantic_read_denied/, "next read sees local role revocation");
    await grant();
    assert.equal((await read()).edges.length, 1, "connection remains usable after a denied read rolls back");
    const restarted = new PostgresSemanticReader(service, { get: async () => raw }, async () => true, async () => published);
    assert.deepEqual(await restarted.read(identity, [kb], query), await read());

    // Bridge P1's durable head into P2's actual service-role source projection.
    await createReleaseTestFixture(admin, namespace);
    const writer = new PostgresPublicationProtocol(admin, namespace, async () => ({
      canPublish: true, sourceRevision: "s1", reviewRevision: "r1", schemaRevision: "o1",
    }));
    await writer.publishSemantic({ kbId: kb, eventId: randomUUID(), expectedGeneration: 0,
      sourceRevision: "s1", reviewRevision: "r1", schemaRevision: "o1", payload: {
        format: SEMANTIC_RELEASE_FORMAT, schema: published.schema,
        entityTypes: [...published.entityTypes].map(([kind, type]) => ({ kind, type })),
        relations: published.relations, sources: published.sources,
      } });
    const loader = new PostgresSemanticReleaseLoader(namespace, published);
    const durableReader = new PostgresSemanticReader(service, { get: async () => raw }, async () => true,
      loader.load.bind(loader));
    assert.deepEqual(await durableReader.read(identity, [kb], query), await read());

    // The actual role/source adapter must not sample away disconnected components.
    const originalRelations=[...published.relations];
    for(let i=0;i<30;i++){
      const sourceId=randomUUID(),targetId=randomUUID();
      await admin.query(`INSERT INTO karda_kb.entity(id,kb_id,kind,name)
        VALUES($1,$3,'legacy',$4),($2,$3,'legacy',$5)`,[sourceId,targetId,kb,`component-source-${i}`,`component-target-${i}`]);
      published.relations.push({...originalRelations[0],id:randomUUID(),sourceId,targetId});
    }
    const overview=await reader.readPackage(identity,[kb],{...query,maxNodes:500,maxEdges:1000},true);
    assert.equal(overview.nodes.length,62);assert.equal(overview.edges.length,31);assert.equal(overview.truncated,false);
    assert.equal(overview.passages.length,1,"shared source evidence is projected only once");
    const boundedOverview=await reader.readPackage(identity,[kb],{...query,maxNodes:10,maxEdges:1000},true);
    assert.equal(boundedOverview.nodes.length,10);assert.equal(boundedOverview.edges.length,5);assert.equal(boundedOverview.truncated,true);
    const pageQuery={...query,maxNodes:10,maxEdges:5,pageCursor:""};
    const firstPage=await reader.readPackage(identity,[kb],pageQuery,true);
    const pageIds=firstPage.edges.map(e=>e.id);let cursor=firstPage.directoryPage!.nextCursor;
    while(cursor){const next=await reader.readPackage(identity,[kb],{...pageQuery,pageCursor:cursor},true);pageIds.push(...next.edges.map(e=>e.id));cursor=next.directoryPage!.nextCursor;}
    assert.deepEqual(pageIds,overview.edges.map(e=>e.id),"all 31 disconnected relations can be paged with no omissions or repeats");
    await admin.query("INSERT INTO local_authz.member_role(member_id,role_id) SELECT $1,id FROM local_authz.role WHERE role_code='member'",[member]);
    const searchPage=(pageCursor:string,scope=[kb])=>reader.readPackage(identity,scope,query,true,false,undefined,{query:"requires",topK:20,pageCursor});
    const rankedFirst=await searchPage("");assert.equal(rankedFirst.search!.items.length,20);assert.ok(rankedFirst.search!.page!.nextCursor);
    const rankedSecond=await searchPage(rankedFirst.search!.page!.nextCursor!);assert.equal(rankedSecond.search!.items.length,11);
    assert.equal(rankedSecond.search!.page!.offset,20);assert.equal(rankedSecond.search!.page!.nextCursor,null);
    assert.equal(new Set([...rankedFirst.search!.items,...rankedSecond.search!.items].map(r=>r.relationId)).size,31);
    await assert.rejects(searchPage(rankedFirst.search!.page!.nextCursor!,[kb,hiddenKb]),/published_search_changed/,"requested scope stays bound even when hidden library contributes no facts");
    await admin.query("UPDATE karda_kb.assertion SET statement=statement||' amended' WHERE id=$1",[assertion]);
    await assert.rejects(searchPage(rankedFirst.search!.page!.nextCursor!),/published_search_changed/);
    await assert.rejects(reader.readPackage(identity,[kb],{...pageQuery,pageCursor:firstPage.directoryPage!.nextCursor!},true),/semantic_directory_changed/);
    await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1 AND user_sub=$2",[kb,sub]);
    await assert.rejects(searchPage(rankedFirst.search!.page!.nextCursor!),/published_search_changed/);
    await assert.rejects(reader.readPackage(identity,[kb],{...pageQuery,pageCursor:firstPage.directoryPage!.nextCursor!},true),/semantic_directory_changed/);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,kb]);
    published.relations=originalRelations;
    await admin.query("UPDATE karda_kb.document SET content_state='deleted' WHERE id=$1", [doc]);
    assert.equal((await durableReader.read(identity, [kb], query)).edges.length, 0,
      "persisted release cannot restore a withdrawn live source");
    const secondDoc=randomUUID(),secondAssertion=randomUUID(),secondSpan=randomUUID(),secondLeft=randomUUID(),secondRight=randomUUID();
    await admin.query("UPDATE karda_kb.document SET content_state='indexed' WHERE id=$1",[doc]);
    await admin.query("INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name) VALUES($1,$2,'user',$3,'second knowledge library')",[secondKb,ws,sub]);
    await admin.query("INSERT INTO karda_kb.kb_attachment(workspace_id,user_sub,product_code,kb_id) VALUES($1,$2,'karda',$3)",[ws,sub,secondKb]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,content_state,active_chunk_version,storage_ref,content_hash,mime,size_bytes)
      VALUES($1,$2,'second source','upload','indexed',2,'test-object',$3,'text/plain',$4)`,[secondDoc,secondKb,hash,raw.length]);
    await admin.query("INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$3,'legacy','left'),($2,$3,'legacy','right')",[secondLeft,secondRight,secondKb]);
    await admin.query("INSERT INTO karda_kb.assertion(id,kb_id,kind,statement,content_state,verification_state) VALUES($1,$2,'fact','second supported','indexed','verified')",[secondAssertion,secondKb]);
    await admin.query("INSERT INTO karda_kb.span(id,document_id,document_version,start_offset,end_offset,excerpt) VALUES($1,$2,2,4,7,$3)",[secondSpan,secondDoc,"\u4e2d\ud83d\ude00"]);
    await admin.query("INSERT INTO karda_kb.evidence(id,assertion_id,span_id,stance) VALUES($1,$2,$3,'supports')",[randomUUID(),secondAssertion,secondSpan]);
    published.sources.push({kbId:secondKb,documentId:secondDoc,version:2,contentHash:hash});
    published.relations.push({...published.relations[0],id:randomUUID(),kbId:secondKb,sourceId:secondLeft,targetId:secondRight,assertionIds:[secondAssertion]});
    const cross=await reader.readPackage(identity,[secondKb,kb,hiddenKb,otherKb],{...query,maxNodes:20,maxEdges:20},true);
    assert.equal(cross.edges.length,2);assert.equal(cross.nodes.length,4,"same-name entities retain distinct library identities");
    assert.deepEqual(new Set(cross.nodes.map(n=>n.kbId)),new Set([kb,secondKb]));
    assert.equal(cross.passages.length,2);
    await admin.query("DELETE FROM karda_kb.kb_attachment WHERE kb_id=$1",[secondKb]);
    const narrowed=await reader.readPackage(identity,[kb,secondKb],query,true);
    assert.equal(narrowed.edges.length,1);assert.ok(narrowed.nodes.every(n=>n.kbId===kb));
  } finally {
    assert.match(namespace, /^semantic_protocol_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=ANY($1::uuid[])", [[kb, hiddenKb, otherKb,secondKb]]);
    if (member) await admin.query("DELETE FROM local_authz.member WHERE id=$1", [member]);
    await service.end(); await admin.end();
  }
});
