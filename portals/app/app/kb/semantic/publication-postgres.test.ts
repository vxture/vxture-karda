import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { PostgresPublicationProtocol, type PublicationAuthority } from "./publication-postgres";
import type { PublicationCommand } from "./publication";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("isolated PostgreSQL publication: concurrency, replay, authority locks, rollback and restart", { skip: !endpoint, timeout: 30000 }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const pool = new Pool({ connectionString: endpoint, max: 5, connectionTimeoutMillis: 5000, statement_timeout: 10000 });
  const namespace = `semantic_protocol_test_${randomUUID().replaceAll("-", "")}`;
  assert.match(namespace, /^semantic_protocol_test_[a-f0-9]{32}$/);
  const schema = `"${namespace}"`, kbId = randomUUID();
  const readAuthority = async (db: PoolClient, id: string): Promise<PublicationAuthority> => {
    const { rows } = await db.query(`SELECT * FROM ${schema}.authority WHERE kb_id=$1 FOR SHARE`, [id]);
    const row = rows[0];
    if (!row) throw new Error("authority_missing");
    return { canPublish: row.can_publish, sourceRevision: row.source_revision,
      reviewRevision: row.review_revision, schemaRevision: row.schema_revision };
  };
  const store = new PostgresPublicationProtocol(pool, namespace, readAuthority);
  const command = (generation: number): PublicationCommand => ({ kbId, eventId: randomUUID(), expectedGeneration: generation,
    sourceRevision: "s1", reviewRevision: "r1", schemaRevision: "o1", payload: { relations: [] } });
  try {
    // Test-only fixture DDL. Not a migration or a service-role grant contract.
    await pool.query(`CREATE SCHEMA ${schema}`);
    await pool.query(`
      CREATE TABLE ${schema}.semantic_release (
        id uuid PRIMARY KEY,kb_id uuid NOT NULL,generation integer NOT NULL CHECK(generation>0),
        fingerprint text NOT NULL,payload jsonb NOT NULL,UNIQUE(kb_id,generation),UNIQUE(kb_id,id,generation));
      CREATE TABLE ${schema}.semantic_release_head (
        kb_id uuid PRIMARY KEY,generation integer NOT NULL,release_id uuid NOT NULL,
        FOREIGN KEY(kb_id,release_id,generation) REFERENCES ${schema}.semantic_release(kb_id,id,generation));
      CREATE TABLE ${schema}.semantic_event_receipt (
        kb_id uuid NOT NULL,event_id uuid NOT NULL,fingerprint text NOT NULL,release_id uuid NOT NULL,generation integer NOT NULL,
        PRIMARY KEY(kb_id,event_id),FOREIGN KEY(kb_id,release_id,generation) REFERENCES ${schema}.semantic_release(kb_id,id,generation));
      CREATE TABLE ${schema}.authority (kb_id uuid PRIMARY KEY,can_publish boolean NOT NULL,
        source_revision text NOT NULL,review_revision text NOT NULL,schema_revision text NOT NULL);
    `);
    await pool.query(`INSERT INTO ${schema}.authority VALUES ($1,true,'s1','r1','o1')`, [kbId]);
    const initial = command(0);
    const repeated = await Promise.all([store.publish(initial), store.publish(initial)]);
    assert.equal(repeated.filter(r => r.duplicate).length, 1);
    assert.equal(repeated[0].releaseId, repeated[1].releaseId);
    await assert.rejects(store.publish({ ...initial, payload: { relations: ["changed"] } }), /publication_event_conflict/);

    const contenders = [command(1), command(1)];
    const raced = await Promise.allSettled(contenders.map(c => store.publish(c)));
    assert.equal(raced.filter(r => r.status === "fulfilled").length, 1);
    const failed = raced.find(r => r.status === "rejected") as PromiseRejectedResult;
    assert.match(String(failed.reason), /publication_stale_generation/);
    await assert.rejects(store.publish(command(0)), /publication_stale_generation/);
    assert.equal((await store.publish(initial)).generation, 1, "replay acknowledges original, never moves current head");

    for (const column of ["source_revision", "review_revision", "schema_revision"]) {
      await pool.query(`UPDATE ${schema}.authority SET ${column}='changed' WHERE kb_id=$1`, [kbId]);
      await assert.rejects(store.publish(command(2)), /publication_authority_changed/);
      const original = column === "source_revision" ? "s1" : column === "review_revision" ? "r1" : "o1";
      await pool.query(`UPDATE ${schema}.authority SET ${column}=$2 WHERE kb_id=$1`, [kbId, original]);
    }
    await pool.query(`UPDATE ${schema}.authority SET can_publish=false WHERE kb_id=$1`, [kbId]);
    await assert.rejects(store.publish(command(2)), /publication_denied/);
    await pool.query(`UPDATE ${schema}.authority SET can_publish=true WHERE kb_id=$1`, [kbId]);

    // Fail the last write, after both release insert and head switch.
    const retry = command(2);
    await pool.query(`ALTER TABLE ${schema}.semantic_event_receipt ADD CONSTRAINT injected_failure CHECK (generation < 3)`);
    await assert.rejects(store.publish(retry), /injected_failure/);
    assert.equal((await pool.query(`SELECT generation FROM ${schema}.semantic_release_head WHERE kb_id=$1`, [kbId])).rows[0].generation, 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.semantic_release`)).rows[0].n, 2);
    assert.equal((await pool.query(`SELECT count(*)::int AS n FROM ${schema}.semantic_event_receipt`)).rows[0].n, 2);
    await pool.query(`ALTER TABLE ${schema}.semantic_event_receipt DROP CONSTRAINT injected_failure`);

    // New pool/store simulates process restart; committed receipts are durable.
    const restartedPool = new Pool({ connectionString: endpoint });
    try {
      const restarted = new PostgresPublicationProtocol(restartedPool, namespace, readAuthority);
      assert.equal((await restarted.publish(retry)).generation, 3);
      assert.equal((await restarted.publish(retry)).duplicate, true);
      assert.equal((await restarted.publish(initial)).generation, 1);
    } finally { await restartedPool.end(); }

    // Hold the authoritative update uncommitted. Publication must wait for its
    // row lock and then reject the changed revision, rather than read old state.
    const writer = await pool.connect();
    try {
      await writer.query("BEGIN");
      await writer.query(`UPDATE ${schema}.authority SET review_revision='r2' WHERE kb_id=$1`, [kbId]);
      let authorityEntered!: (pid: number) => void;
      const entered = new Promise<number>(resolve => { authorityEntered = resolve; });
      const waitingStore = new PostgresPublicationProtocol(pool, namespace, async (db, id) => {
        const result = await db.query("SELECT pg_backend_pid() AS pid");
        authorityEntered(result.rows[0].pid); return readAuthority(db, id);
      });
      const waiting = assert.rejects(waitingStore.publish(command(3)), /publication_authority_changed/);
      const pid = await entered;
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        const state = await pool.query("SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1", [pid]);
        if (state.rows[0]?.wait_event_type === "Lock") { blocked = true; break; }
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      await writer.query("COMMIT");
      await waiting;
      assert.equal(blocked, true, "publication waits on the authoritative revision row");
    } finally { await writer.query("ROLLBACK"); writer.release(); }
    assert.equal((await pool.query(`SELECT generation FROM ${schema}.semantic_release_head WHERE kb_id=$1`, [kbId])).rows[0].generation, 3);
    // A distinct library has its own head and receipt namespace.
    const otherKb = randomUUID();
    await pool.query(`INSERT INTO ${schema}.authority VALUES ($1,true,'s1','r1','o1')`, [otherKb]);
    assert.equal((await store.publish({ ...initial, kbId: otherKb })).generation, 1);
  } finally {
    await pool.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await pool.end();
  }
});
