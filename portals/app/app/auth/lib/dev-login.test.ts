import { test } from "node:test";
import assert from "node:assert/strict";
import { devLoginEnabled, devAuthUser, encodeDevSession, decodeDevSession } from "./dev-login";

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const saved: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

test("the triple gate: opt-in AND no real RP AND not production - fail-closed otherwise", () => {
  withEnv({ AUTH_DEV_LOGIN: "on", DEPLOY_STAGE: "dev" }, () => {
    assert.equal(devLoginEnabled(false), true);
    assert.equal(devLoginEnabled(true), false, "a configured IdP disables dev login");
  });
  withEnv({ AUTH_DEV_LOGIN: undefined, DEPLOY_STAGE: "dev" }, () => {
    assert.equal(devLoginEnabled(false), false, "unset = off, never a default");
  });
  withEnv({ AUTH_DEV_LOGIN: "on", DEPLOY_STAGE: "production" }, () => {
    assert.equal(devLoginEnabled(false), false, "production stage locks it out");
  });
});

test("dev session round-trips through the cookie codec", () => {
  const user = devAuthUser({ sub: "usr_second", ws: "11111111-1111-4111-8111-111111111111" });
  const decoded = decodeDevSession(encodeDevSession(user));
  assert.equal(decoded?.sub, "usr_second");
  assert.equal(decoded?.activeWorkspace, "11111111-1111-4111-8111-111111111111");
  assert.equal(decoded?.isWorkspaceOwner, true);
  assert.equal(decoded?.accountStatus, "active");
});

test("malformed or empty cookies decode to anonymous, never throw", () => {
  assert.equal(decodeDevSession(undefined), null);
  assert.equal(decodeDevSession("not-base64!!"), null);
  assert.equal(decodeDevSession(Buffer.from("{\"nosub\":1}").toString("base64url")), null);
});
