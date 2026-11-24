import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { PostgresSemanticReader, type PublishedRelationInput } from "./read-postgres";
import type { NeighborhoodQuery } from "./contracts";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("semantic native-text adapter: live roles, attachment/tenant scope, source versions and consistent snapshots", { skip: !endpoint, timeout: 30000 }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint, statement_timeout: 5000 });
  url.username = "karda_svc";
  const service = new Pool({ connectionString: url.toString(), statement_timeout: 5000 });
  const ws = randomUUID(), otherWs = randomUUID(), sub = `usr_${randomUUID()}`;
  const kb = randomUUID(), hiddenKb = randomUUID(), otherKb = randomUUID();
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
  const reader = new PostgresSemanticReader(service, { get: async () => { reads++; return stored; } },
    async () => platformAllowed, async (db, ids) => {
      loadedKbIds = ids;
      // A real service-role transaction must stay read-only.
      assert.equal((await db.query("SHOW transaction_read_only")).rows[0].transaction_read_only, "on");
      if (afterSnapshot) { const effect = afterSnapshot; afterSnapshot = undefined; await effect(); }
      return published;
    });
  const read = () => reader.read(identity, [kb, hiddenKb, otherKb], query);
  let member: string | undefined;
  try {
    member = (await admin.query("INSERT INTO local_authz.member(workspace_id,sub) VALUES($1,$2) RETURNING id", [ws, sub])).rows[0].id;
    const grant = () => admin.query(`INSERT INTO local_authz.member_role(member_id,role_id)
      SELECT $1,id FROM local_authz.role WHERE role_code='readonly'`, [member]);
    assert.equal((await grant()).rowCount, 1);
    for (const [id, workspace, owner] of [[kb, ws, sub], [hiddenKb, ws, `usr_${randomUUID()}`], [otherKb, otherWs, sub]]) {
      await admin.query(`INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name)
        VALUES($1,$2,'user',$3,'semantic-adapter-test')`, [id, workspace, owner]);
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
  } finally {
    await admin.query("DELETE FROM karda_kb.knowledge_base WHERE id=ANY($1::uuid[])", [[kb, hiddenKb, otherKb]]);
    if (member) await admin.query("DELETE FROM local_authz.member WHERE id=$1", [member]);
    await service.end(); await admin.end();
  }
});
