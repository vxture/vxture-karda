import { test } from "node:test";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { withProcessingLease } from "./dispatch";

const endpoint = process.env.KARDA_PROVISION_TEST_DATABASE_URL;
test("processing lease excludes a second DB session and releases on success/failure", { skip: !endpoint }, async () => {
  const url = new URL(endpoint!);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname));
  assert.equal(url.pathname, "/karda_p3_test");
  url.username = "karda_svc";
  process.env.DATABASE_URL = url.toString();
  const probe = new Pool({ connectionString: url.toString(), max: 1 });
  const client = await probe.connect();
  try {
    assert.equal(await withProcessingLease(async () => {
      const blocked = await client.query("SELECT pg_try_advisory_lock(1903240, 1) AS locked");
      assert.equal(blocked.rows[0].locked, false);
      assert.equal(await withProcessingLease(async () => "overlap"), null);
      return "done";
    }), "done");
    await assert.rejects(withProcessingLease(async () => { throw new Error("test failure"); }), /test failure/);
    assert.equal((await client.query("SELECT pg_try_advisory_lock(1903240, 1) AS locked")).rows[0].locked, true);
  } finally {
    await client.query("SELECT pg_advisory_unlock(1903240, 1)");
    client.release(); await probe.end();
  }
});
