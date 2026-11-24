import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

const ddl = fileURLToPath(new URL("../../../../../deploy/database/ddl/", import.meta.url));
const read = (name: string) => readFileSync(`${ddl}/${name}`, "utf8").replace(/\r\n/g,"\n");
const baseline = read("00_baseline.sql"), locks = read("98_column_locks.sql");
const increment = read("incr/0016_semantic_foundation.sql");
function section(text: string, name: string) {
  const start = `-- BEGIN SEMANTIC ${name}`, end = `-- END SEMANTIC ${name}`;
  assert.equal(text.split(start).length, 2);
  assert.equal(text.split(end).length, 2);
  return text.slice(text.indexOf(start), text.indexOf(end) + end.length);
}
const structure = section(increment, "FOUNDATION"), grants = section(increment, "LOCKS");
const tables = [...structure.matchAll(/CREATE TABLE IF NOT EXISTS karda_kb\.(\w+)/g)].map(m => m[1]);

test("semantic foundation: fresh/increment structure and least-privilege locks are identical", () => {
  assert.equal(section(baseline, "FOUNDATION"), structure);
  assert.equal(section(locks, "LOCKS"), grants);
  assert.equal(tables.length, 10);
  assert.equal(new Set(tables).size, 10);
});

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("semantic foundation PostgreSQL: fresh and old-41 upgrade twice, immutable review/release, scope and rollback", {
  skip: !endpoint, timeout: 120000,
}, async () => {
  const url = new URL(endpoint!);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  const control = new Pool({ connectionString: url.toString(), statement_timeout: 15000 });
  const increments = readdirSync(`${ddl}/incr`).filter(n => n.endsWith(".sql")).sort();
  const names: string[] = [], pools: Pool[] = [];
  const kb = randomUUID(), other = randomUUID(), ws = randomUUID();
  const oldEntity = randomUUID(), foreignEntity = randomUUID(), doc = randomUUID(), assertion = randomUUID();
  const schema = randomUUID(), run = randomUUID(), release = randomUUID(), review = randomUUID(), relation = randomUUID();
  const hash = "a".repeat(64);
  async function createDatabase() {
    const name = `semantic_migration_test_${randomUUID().replaceAll("-", "")}`;
    assert.match(name, /^semantic_migration_test_[a-f0-9]{32}$/);
    await control.query(`CREATE DATABASE "${name}"`); names.push(name);
    const dbUrl = new URL(url); dbUrl.pathname = `/${name}`;
    const admin = new Pool({ connectionString: dbUrl.toString(), statement_timeout: 15000 }); pools.push(admin);
    dbUrl.username = "karda_svc";
    const service = new Pool({ connectionString: dbUrl.toString(), statement_timeout: 5000 }); pools.push(service);
    return { admin, service };
  }
  async function apply(admin: Pool, old = false) {
    await admin.query(old ? baseline.replace(/-- BEGIN DOCUMENT TEXT SNAPSHOT[\s\S]*?-- END DOCUMENT TEXT SNAPSHOT/, "").replace(structure, "").replace(/-- BEGIN SEMANTIC TASK\r?\n[\s\S]*?-- END SEMANTIC TASK\r?\n/, "") : baseline);
    await admin.query(read("97_service_role.sql"));
    for (const name of increments) if (!old || name < "0016") await admin.query(read(`incr/${name}`));
    await admin.query(old ? locks.replace(/-- BEGIN DOCUMENT TEXT LOCKS[\s\S]*?-- END DOCUMENT TEXT LOCKS/, "").replace(grants, "").replace(/-- BEGIN SEMANTIC TASK LOCKS\r?\n[\s\S]*?-- END SEMANTIC TASK LOCKS\r?\n/, "") : locks);
  }
  async function seed(admin: Pool) {
    await admin.query(`INSERT INTO karda_kb.knowledge_base(id,workspace_id,owner_type,owner_sub,name)
      VALUES($1,$3,'user','synthetic','synthetic'),($2,$3,'user','synthetic','other')`, [kb, other, ws]);
    await admin.query(`INSERT INTO karda_kb.entity(id,kb_id,kind,name) VALUES($1,$2,'thing','original'),($3,$4,'thing','foreign')`,
      [oldEntity, kb, foreignEntity, other]);
    await admin.query(`INSERT INTO karda_kb.document(id,kb_id,title,source,mime,size_bytes)
      VALUES($1,$2,'original','upload','text/plain',1)`, [doc, kb]);
    await admin.query(`INSERT INTO karda_kb.assertion(id,kb_id,kind,statement) VALUES($1,$2,'fact','original')`, [assertion, kb]);
  }
  async function snapshot(admin: Pool) {
    return (await admin.query(`SELECT table_name,column_name,data_type,is_nullable,column_default
      FROM information_schema.columns WHERE table_schema='karda_kb' ORDER BY table_name,ordinal_position`)).rows;
  }
  try {
    const fresh = await createDatabase(), upgraded = await createDatabase();
    await apply(fresh.admin); await apply(fresh.admin);
    await apply(upgraded.admin, true);
    assert.equal(Number((await upgraded.admin.query(`SELECT count(*) FROM information_schema.tables
      WHERE table_schema IN ('karda_kb','local_authz','local_usage','vx_provision') AND table_type='BASE TABLE'`)).rows[0].count), 41);
    await seed(upgraded.admin);
    const original = (await upgraded.admin.query("SELECT * FROM karda_kb.entity WHERE id=$1", [oldEntity])).rows[0];
    // Run the actual db-init order on the existing 41-table database twice.
    await apply(upgraded.admin); await apply(upgraded.admin);
    assert.deepEqual(await snapshot(upgraded.admin), await snapshot(fresh.admin));
    assert.deepEqual((await upgraded.admin.query("SELECT * FROM karda_kb.entity WHERE id=$1", [oldEntity])).rows[0], original);
    for (const { admin, service } of [fresh, upgraded]) {
      if (admin === fresh.admin) await seed(admin);
      assert.equal(Number((await admin.query(`SELECT count(*) FROM information_schema.tables
        WHERE table_schema IN ('karda_kb','local_authz','local_usage','vx_provision') AND table_type='BASE TABLE'`)).rows[0].count), 53);
      await service.query(`INSERT INTO karda_kb.semantic_schema_version(id,kb_id,namespace,schema_id,version,definition_hash,definition)
        VALUES($1,$2,'test','things','1',$3,'{}')`, [schema, kb, hash]);
      await service.query(`INSERT INTO karda_kb.semantic_review(id,kb_id,subject_key,revision,decision,subject_hash,reviewer_sub,note)
        VALUES($1,$2,'relation',1,'accept',$3,'synthetic-reviewer','synthetic test only')`, [review, kb, hash]);
      const compile = async (id: string, fingerprint: string) => service.query(`INSERT INTO karda_kb.semantic_compile_run
        (id,kb_id,schema_version_id,task_key,input_hash,config_hash,source_manifest,candidates,status,created_by)
        VALUES($1,$2,$3,$4,$4,$4,'[]','{}','validated','synthetic')`, [id, kb, schema, fingerprint]);
      await compile(run, hash);
      await service.query(`INSERT INTO karda_kb.semantic_release(id,kb_id,generation,schema_version_id,compile_run_id,fingerprint,payload,created_by)
        VALUES($1,$2,1,$3,$4,$5,'{}','synthetic')`, [release, kb, schema, run, hash]);
      await service.query("INSERT INTO karda_kb.semantic_release_head(kb_id,generation,release_id) VALUES($1,1,$2)", [kb, release]);
      await service.query(`INSERT INTO karda_kb.semantic_relation(kb_id,release_id,relation_id,type,source_id,target_id)
        VALUES($1,$2,$3,'requires',$4,$4)`, [kb, release, relation, oldEntity]);
      await service.query(`INSERT INTO karda_kb.semantic_relation_assertion(kb_id,release_id,relation_id,assertion_id)
        VALUES($1,$2,$3,$4)`, [kb, release, relation, assertion]);
      await service.query(`INSERT INTO karda_kb.semantic_release_source(kb_id,release_id,document_id,document_version,content_hash)
        VALUES($1,$2,$3,1,$4)`, [kb, release, doc, hash]);
      await service.query("INSERT INTO karda_kb.semantic_release_review(kb_id,release_id,review_id) VALUES($1,$2,$3)", [kb, release, review]);
      await service.query(`INSERT INTO karda_kb.semantic_event_receipt(kb_id,event_id,fingerprint,release_id,generation)
        VALUES($1,$2,$3,$4,1)`, [kb, randomUUID(), hash, release]);
      for (const table of tables) {
        await assert.rejects(service.query(`DELETE FROM karda_kb.${table} WHERE false`), { code: "42501" });
        if (table !== "semantic_release_head")
          await assert.rejects(service.query(`UPDATE karda_kb.${table} SET created_at=now() WHERE false`), { code: "42501" });
      }
      await assert.rejects(service.query("UPDATE karda_kb.semantic_release_head SET kb_id=$1 WHERE false", [other]), { code: "42501" });
      assert.equal((await service.query("UPDATE karda_kb.semantic_release_head SET updated_at=now() WHERE kb_id=$1", [kb])).rowCount, 1);
      await assert.rejects(service.query(`INSERT INTO karda_kb.semantic_relation(kb_id,release_id,relation_id,type,source_id,target_id)
        VALUES($1,$2,$3,'requires',$4,$5)`, [kb, release, randomUUID(), oldEntity, foreignEntity]), { code: "23503" });
      await assert.rejects(service.query("INSERT INTO karda_kb.semantic_release_review(kb_id,release_id,review_id) VALUES($1,$2,$3)",
        [other, release, review]), { code: "23503" });
      await assert.rejects(service.query("INSERT INTO karda_kb.semantic_release_head(kb_id,generation,release_id) VALUES($1,2,$2)",
        [other, release]), { code: "23503" });
      await assert.rejects(service.query(`INSERT INTO karda_kb.semantic_release_source(kb_id,release_id,document_id,document_version,content_hash)
        VALUES($1,$2,$3,1,$4)`, [other, release, doc, hash]), { code: "23503" });
      await assert.rejects(service.query(`INSERT INTO karda_kb.semantic_review(kb_id,subject_key,revision,decision,subject_hash,reviewer_sub,note)
        VALUES($1,'bad-review',1,'accept',$2,' ','reason')`, [kb, hash]), { code: "23514" });
      await assert.rejects(service.query(`INSERT INTO karda_kb.semantic_review(kb_id,subject_key,revision,decision,subject_hash,reviewer_sub,note)
        VALUES($1,'relation',1,'reject',$2,'synthetic','duplicate')`, [kb, hash]), { code: "23505" });
      await compile(randomUUID(), "b".repeat(64));
      assert.equal((await service.query("SELECT decision FROM karda_kb.semantic_review WHERE id=$1", [review])).rows[0].decision, "accept");
      const transaction = await service.connect(), secondRelease = randomUUID();
      try {
        await transaction.query("BEGIN");
        await transaction.query(`INSERT INTO karda_kb.semantic_release(id,kb_id,generation,schema_version_id,compile_run_id,fingerprint,payload,created_by)
          VALUES($1,$2,2,$3,$4,$5,'{}','synthetic')`, [secondRelease, kb, schema, run, hash]);
        await transaction.query("UPDATE karda_kb.semantic_release_head SET generation=2,release_id=$2 WHERE kb_id=$1 AND generation=1", [kb, secondRelease]);
        // A late failure must roll back both the immutable release and head switch.
        await assert.rejects(transaction.query("INSERT INTO karda_kb.semantic_release_review(kb_id,release_id,review_id) VALUES($1,$2,$3)",
          [kb, secondRelease, randomUUID()]), { code: "23503" });
        await transaction.query("ROLLBACK");
      } finally { await transaction.query("ROLLBACK"); transaction.release(); }
      assert.equal((await service.query("SELECT generation FROM karda_kb.semantic_release_head WHERE kb_id=$1", [kb])).rows[0].generation, 1);
      assert.equal((await service.query("SELECT id FROM karda_kb.semantic_release WHERE id=$1", [secondRelease])).rowCount, 0);
      await apply(admin);
      assert.equal((await service.query("SELECT decision FROM karda_kb.semantic_review WHERE id=$1", [review])).rows[0].decision, "accept");
      for (const table of tables) await assert.rejects(service.query(`DELETE FROM karda_kb.${table} WHERE false`), { code: "42501" });
      assert.equal((await service.query("SELECT name FROM karda_kb.entity WHERE id=$1", [oldEntity])).rows[0].name, "original",
        "legacy reads remain usable without consuming semantic tables");
    }
  } finally {
    await Promise.all(pools.map(pool => pool.end()));
    for (const name of names) {
      assert.match(name, /^semantic_migration_test_[a-f0-9]{32}$/);
      await control.query(`DROP DATABASE "${name}"`);
    }
    await control.end();
  }
});
