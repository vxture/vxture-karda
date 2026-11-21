import { strict as assert } from "node:assert";
import { test } from "node:test";
import { reconcileProvisioning } from "./reconcile";
const item = { workspace_id: "11111111-1111-4111-8111-111111111111", tenant_id: "33333333-3333-4333-8333-333333333333", state: "provisioned", seq: 2,
  updated_at: "2026-11-21T12:00:00.123456Z" };
test("full rounds restart, skip pending, and never infer deletion from missing rows", async () => {
  const cursors: (string | undefined)[] = [], applied: string[] = [];
  const deps = { page: async (cursor?: string) => {
    cursors.push(cursor);
    return cursor ? { items: [{ ...item, workspace_id: "22222222-2222-4222-8222-222222222222", state: "pending" }], nextCursor: null }
      : { items: [item], nextCursor: "page2" };
  }, apply: async (row: { workspace_id: string }) => { applied.push(row.workspace_id); } };
  assert.deepEqual(await reconcileProvisioning(deps), { pages: 2, scanned: 2, failed: 0 });
  await reconcileProvisioning(deps);
  assert.deepEqual(cursors, [undefined, "page2", undefined, "page2"]);
  assert.deepEqual(applied, ["11111111-1111-4111-8111-111111111111", "11111111-1111-4111-8111-111111111111"]);
});
test("cursor loops/malformed pages fail and one row failure does not hide remaining rows", async () => {
  await assert.rejects(reconcileProvisioning({ page: async () => ({ items: [], nextCursor: "same" }),
    apply: async () => {} }), /cursor_loop/);
  await assert.rejects(reconcileProvisioning({ page: async () => ({ items: [{ ...item, seq: -1 }], nextCursor: null }),
    apply: async () => {} }));
  let count = 0;
  const result = await reconcileProvisioning({ page: async () => ({ items: [item, item], nextCursor: null }),
    apply: async () => { if (++count === 1) throw new Error("retry"); } });
  assert.equal(result.failed, 1);
  assert.equal(count, 2);
});
