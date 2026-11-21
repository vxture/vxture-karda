import { test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route";

test("production and beta reject fixture seeding even with a valid internal token", async () => {
  const previousStage = process.env.DEPLOY_STAGE, previousToken = process.env.INTERNAL_JOB_TOKEN;
  try {
    process.env.INTERNAL_JOB_TOKEN = "local-test-only";
    for (const stage of ["production", "beta"]) {
      process.env.DEPLOY_STAGE = stage;
      const response = await POST(new Request("http://localhost/api/kb/admin/seed-demo", {
        method: "POST", headers: { "x-internal-job-token": "local-test-only" },
      }));
      assert.equal(response.status, 404);
    }
  } finally {
    if (previousStage === undefined) delete process.env.DEPLOY_STAGE; else process.env.DEPLOY_STAGE = previousStage;
    if (previousToken === undefined) delete process.env.INTERNAL_JOB_TOKEN; else process.env.INTERNAL_JOB_TOKEN = previousToken;
  }
});
