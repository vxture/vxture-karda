import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The extraction pass needs a Postgres to run, so what is pinned here is the
// SEAM, read from the source: that the tenant handed to Atlas is resolved
// through `tenantForWorkspace` and is never the workspace id.
//
// Why a source assertion rather than a behaviour test: the defect it guards is
// invisible to types (workspace id and tenant id are both uuid strings) and
// invisible to any offline run (the call parks on the missing grant long before
// the tenant is read). It shipped in #156 and was caught by the owner asking why
// a tenant uuid was needed at all.

const SRC = readFileSync("app/kb/assertions/extract-pass.ts", "utf8");

test("the tenant sent to Atlas is RESOLVED, never the workspace id", () => {
  assert.match(SRC, /tenantForWorkspace\(/, "must go through the provisioning-table lookup");
  assert.doesNotMatch(
    SRC,
    /tenantId:\s*\w+\.knowledgeBase\.workspaceId/,
    "a workspace id in the tenant field type-checks and resolves against the WRONG tenant",
  );
});

test("a document whose workspace has no platform tenant is skipped, not failed", () => {
  // Nothing went wrong - it is simply not provisioned, so there is no tenant to
  // authorize or bill against.
  assert.match(SRC, /no_platform_tenant/);
});
