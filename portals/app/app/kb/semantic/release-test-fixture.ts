import type { Pool } from "pg";

/** Test-only sandbox tables, not production migration SQL. */
export async function createReleaseTestFixture(pool: Pool, namespace: string): Promise<void> {
  if (!/^semantic_protocol_test_[a-f0-9]{32}$/.test(namespace)) throw new Error("invalid_test_schema");
  const schema = `"${namespace}"`;
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
    GRANT USAGE ON SCHEMA ${schema} TO karda_svc;
    GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO karda_svc;
  `);
}
