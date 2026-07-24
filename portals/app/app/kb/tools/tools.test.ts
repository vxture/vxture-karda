import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TOOLS,
  manifest,
  toolByName,
  checkMode,
  requiresUser,
  PROTOCOL_VERSION,
} from "./catalog";
import { callerFromClaims, rejectsInternalAuthHeader, type S2sClaims } from "./s2s";

// --- catalog -----------------------------------------------------------------

test("the v1 tool surface is exactly the seven karda.* tools", () => {
  assert.deepEqual(
    TOOLS.map((t) => t.name).sort(),
    [
      "karda.ask",
      "karda.attach_kb",
      "karda.create_entry",
      "karda.create_kb",
      "karda.detach_kb",
      "karda.list_kbs",
      "karda.search",
      "karda.write_document",
    ].sort(),
  );
});

test("create / attach / write are OBO-only; read tools are obo_or_service", () => {
  const oboOnly = TOOLS.filter((t) => t.mode === "obo_only").map((t) => t.name).sort();
  assert.deepEqual(oboOnly, [
    "karda.attach_kb",
    "karda.create_entry",
    "karda.create_kb",
    "karda.detach_kb",
    "karda.write_document",
  ]);
  assert.equal(toolByName("karda.search")!.mode, "obo_or_service");
  assert.equal(toolByName("karda.ask")!.mode, "obo_or_service");
  assert.equal(toolByName("karda.list_kbs")!.mode, "obo_or_service");
});

test("metering matches the design: search/ask per_call, write/entry per_doc, rest none", () => {
  assert.deepEqual(toolByName("karda.search")!.metering, { kind: "per_call", metric: "karda.search" });
  assert.deepEqual(toolByName("karda.write_document")!.metering, { kind: "per_doc", metric: "karda.ingest" });
  assert.deepEqual(toolByName("karda.create_entry")!.metering, { kind: "per_doc", metric: "karda.ingest" });
  assert.equal(toolByName("karda.list_kbs")!.metering.kind, "none");
  assert.equal(toolByName("karda.create_kb")!.metering.kind, "none");
});

test("every descriptor declares knowledge_base asset type", () => {
  for (const t of TOOLS) assert.deepEqual(t.authz.asset_types, ["knowledge_base"]);
});

test("manifest carries the protocol version and every tool", () => {
  const m = manifest();
  assert.equal(m.protocol_version, PROTOCOL_VERSION);
  assert.equal(m.tools.length, TOOLS.length);
});

// --- mode gate: the OBO-only rule -------------------------------------------

test("an OBO-only tool refuses a service call with access_denied", () => {
  const write = toolByName("karda.write_document")!;
  const denied = checkMode(write, "service");
  assert.ok(!denied.allowed && /access_denied/.test(denied.reason));
  // ...but allows an OBO call
  assert.deepEqual(checkMode(write, "obo"), { allowed: true });
});

test("a read tool allows both modes", () => {
  const search = toolByName("karda.search")!;
  assert.deepEqual(checkMode(search, "service"), { allowed: true });
  assert.deepEqual(checkMode(search, "obo"), { allowed: true });
});

test("requiresUser tracks the OBO-only tools", () => {
  assert.ok(requiresUser(toolByName("karda.create_kb")!));
  assert.ok(!requiresUser(toolByName("karda.search")!));
});

// --- S2S caller context ------------------------------------------------------

const claims = (over: Partial<S2sClaims> = {}): S2sClaims => ({
  iss: "https://accounts.vxture.com",
  aud: "karda",
  act: { sub: "runa" },
  org_id: "org_1",
  workspace_id: "ws_1",
  exp: 9999999999,
  ...over,
});

test("a token with no act.sub is a misused user token and is rejected", () => {
  const r = callerFromClaims(claims({ act: undefined }));
  assert.ok(!r.ok && r.status === 401 && /act\.sub/.test(r.error));
});

test("OBO mode is derived from a user sub; service mode from its absence", () => {
  const obo = callerFromClaims(claims({ sub: "usr_9" }));
  assert.ok(obo.ok && obo.caller.mode === "obo" && obo.caller.user === "usr_9");

  const service = callerFromClaims(claims({ sub: undefined }));
  assert.ok(service.ok && service.caller.mode === "service" && service.caller.user === null);
});

test("the caller product comes from act.sub, org/ws from the token", () => {
  const r = callerFromClaims(claims({ act: { sub: "atlas" }, org_id: "o", workspace_id: "w" }));
  assert.ok(r.ok);
  assert.equal(r.caller.callerProduct, "atlas");
  assert.equal(r.caller.org, "o");
  assert.equal(r.caller.workspace, "w");
});

test("an x-vxture-internal-auth header is refused on the tool surface", () => {
  const withHeader = new Headers({ "x-vxture-internal-auth": "shared-secret" });
  assert.ok(rejectsInternalAuthHeader(withHeader), "the shared platform secret is not a P2P credential");
  const without = new Headers();
  assert.ok(!rejectsInternalAuthHeader(without));
});
