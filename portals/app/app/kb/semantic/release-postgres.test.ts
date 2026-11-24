import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { createReleaseTestFixture } from "./release-test-fixture";
import { PostgresPublicationProtocol } from "./publication-postgres";
import { PostgresSemanticReleaseLoader } from "./release-postgres";
import { SEMANTIC_RELEASE_FORMAT, type SemanticReleasePayload } from "./release-format";
import { preparePublication, type PublicationCommand } from "./publication";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("durable semantic loader: current heads, restart, isolated scope, snapshot and corruption refusal", { skip: !endpoint, timeout: 30000 }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const admin = new Pool({ connectionString: endpoint, statement_timeout: 5000 });
  url.username = "karda_svc";
  const service = new Pool({ connectionString: url.toString(), statement_timeout: 5000 });
  const namespace = `semantic_protocol_test_${randomUUID().replaceAll("-", "")}`, kbId = randomUUID(), otherKb = randomUUID();
  const schema = { namespace: "test", schemaId: "objects", version: "1", entityTypes: ["object"],
    relationTypes: [{ id: "requires", sourceTypes: ["object"], targetTypes: ["object"] }] };
  const pinned = { schema, entityTypes: new Map([["legacy", "object"]]) };
  const command = (generation: number, kb = kbId): PublicationCommand & {payload: SemanticReleasePayload} => ({
    kbId: kb, eventId: randomUUID(), expectedGeneration: generation, sourceRevision: "s1", reviewRevision: "r1", schemaRevision: "o1",
    payload: { format: SEMANTIC_RELEASE_FORMAT, schema, entityTypes: [{ kind: "legacy", type: "object" }],
      sources: [{ kbId: kb, documentId: randomUUID(), version: 1, contentHash: "a".repeat(64) }],
      relations: [{ id: randomUUID(), kbId: kb, schema: { namespace: schema.namespace, schemaId: schema.schemaId, version: schema.version }, type: "requires", sourceId: randomUUID(), targetId: randomUUID(),
        origin: "asserted", assertionIds: [randomUUID()] }] },
  });
  const writer = new PostgresPublicationProtocol(admin, namespace, async () => ({
    canPublish: true, sourceRevision: "s1", reviewRevision: "r1", schemaRevision: "o1",
  }));
  const load = async (ids: string[]) => {
    const db = await service.connect();
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const result = await new PostgresSemanticReleaseLoader(namespace, pinned).load(db, ids);
      await db.query("COMMIT"); return result;
    } catch (error) { await db.query("ROLLBACK"); throw error; }
    finally { db.release(); }
  };
  try {
    await createReleaseTestFixture(admin, namespace);
    const bad = command(0); bad.payload.relations[0].origin = "suggested";
    await assert.rejects(writer.publishSemantic(bad), /semantic_invalid_release/);
    assert.equal((await load([kbId])).relations.length, 0, "invalid semantic payload never creates a head");
    const first = command(0), receipt = await writer.publishSemantic(first);
    await writer.publishSemantic(command(0, otherKb));
    assert.deepEqual((await load([kbId])).relations, first.payload.relations);
    assert.equal((await load([])).relations.length, 0);
    assert.equal((await load([randomUUID()])).relations.length, 0);

    const db = await service.connect();
    const next = command(1);
    try {
      await db.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const loader = new PostgresSemanticReleaseLoader(namespace, pinned);
      assert.deepEqual((await loader.load(db, [kbId])).relations, first.payload.relations);
      await writer.publishSemantic(next);
      assert.deepEqual((await loader.load(db, [kbId])).relations, first.payload.relations,
        "head and release remain on one consistent snapshot");
      await db.query("COMMIT");
    } finally { await db.query("ROLLBACK"); db.release(); }
    assert.deepEqual((await load([kbId])).relations, next.payload.relations, "new loader reads durable current head");
    assert.equal((await writer.publishSemantic(first)).releaseId, receipt.releaseId);
    assert.deepEqual((await load([kbId])).relations, next.payload.relations, "old receipt replay does not move head");

    // Corrupt the historical row: it is neither read nor allowed to poison the
    // current head. Sandbox admin injection does not model production grants.
    await admin.query(`UPDATE "${namespace}".semantic_release SET fingerprint='corrupt' WHERE id=$1`, [receipt.releaseId]);
    assert.deepEqual((await load([kbId])).relations, next.payload.relations);
    await admin.query(`UPDATE "${namespace}".semantic_release SET fingerprint='corrupt' WHERE kb_id=$1 AND generation=2`, [kbId]);
    await assert.rejects(load([kbId]), /semantic_corrupt_release/);
    await admin.query(`UPDATE "${namespace}".semantic_release SET fingerprint=$2 WHERE kb_id=$1 AND generation=2`,
      [kbId, preparePublication(next).fingerprint]);
    const incompatible = command(2);
    incompatible.payload.entityTypes = [{ kind: "new-kind", type: "object" }];
    await writer.publishSemantic(incompatible);
    await assert.rejects(load([kbId]), /semantic_release_schema_mismatch/);
    assert.equal((await load([otherKb])).relations.length, 1, "a different library cannot affect an authorized read");
  } finally {
    assert.match(namespace, /^semantic_protocol_test_[a-f0-9]{32}$/);
    await admin.query(`DROP SCHEMA IF EXISTS "${namespace}" CASCADE`);
    await service.end(); await admin.end();
  }
});
