import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCentralSession } from "./central-session";
import { getOidcConfig } from "./config";

test("central status uses read-only authenticated bounded request", async () => {
  const result = await checkCentralSession(getOidcConfig(), "sid", async (url, init) => {
    assert.match(String(url), /\/oidc\/session\/status$/);
    assert.deepEqual(JSON.parse(String(init?.body)), { sid: "sid", active: false });
    assert.match(new Headers(init?.headers).get("Authorization")!, /^Basic /);
    assert.equal(init?.redirect, "error"); assert.ok(init?.signal);
    return Response.json({ valid: true, next_check_at: 1200 });
  }, 1000);
  assert.deepEqual(result, { valid: true, next_check_at: 1200 });
});

test("only HTTP200 explicit false proves logout", async () => {
  assert.deepEqual(await checkCentralSession(getOidcConfig(), "sid",
    async () => Response.json({ valid: false }), 1000), { valid: false });
  for (const [body, status] of [[{ valid: false }, 503], [{ valid: true, next_check_at: 999 }, 200],
    [{ valid: true, next_check_at: 1000.5 }, 200], [{}, 200], [null, 200]] as const) {
    await assert.rejects(checkCentralSession(getOidcConfig(), "sid", async () => Response.json(body, { status }), 1000));
  }
});
