import { UsagePersistenceError } from "../../usage/lib/buffer";
import { test } from "node:test";
import assert from "node:assert/strict";
import { dispatchTool, type ToolBackends } from "./dispatch";
import type { CallerContext } from "./s2s";

const oboCaller = (over: Partial<CallerContext> = {}): CallerContext => ({
  callerProduct: "runa",
  org: "org_1",
  workspace: "ws_1",
  user: "usr_1",
  mode: "obo",
  productAccess: {roles:["member"],permissions:["product.enter","data.read","data.write","ai.use"]},
  ...over,
});
const serviceCaller = (over: Partial<CallerContext> = {}): CallerContext =>
  oboCaller({ user: null, mode: "service", ...over });

const backends = (over: Partial<ToolBackends> = {}): ToolBackends => ({
  async listKbs() {
    return [{ id: "kb1" }];
  },
  ...over,
});

test("an unknown tool is 404", async () => {
  const r = await dispatchTool("karda.nope", {}, oboCaller(), backends());
  assert.equal(r.status, 404);
  assert.equal(r.body.error, "unknown_tool");
});

test("a service call to an OBO-only tool is 403 access_denied", async () => {
  // The crux: this holds regardless of whether the backend exists.
  for (const name of ["karda.create_kb", "karda.attach_kb", "karda.write_document", "karda.create_entry", "karda.detach_kb"]) {
    const r = await dispatchTool(name, {}, serviceCaller(), backends());
    assert.equal(r.status, 403, `${name} service call must be denied`);
    assert.equal(r.body.error, "access_denied");
  }
});

test("an OBO call to an OBO-only tool passes the gate (then hits not_implemented)", async () => {
  const r = await dispatchTool("karda.create_kb", { name: "x" }, oboCaller(), backends());
  assert.equal(r.status, 501, "gate passed, backend not wired");
  assert.equal(r.body.error, "not_implemented");
});

test("list_kbs works in both modes and returns the backend result", async () => {
  const asObo = await dispatchTool("karda.list_kbs", {}, oboCaller(), backends());
  assert.equal(asObo.status, 200);
  const asService = await dispatchTool("karda.list_kbs", {}, serviceCaller(), backends());
  assert.equal(asService.status, 200, "list_kbs is obo_or_service");
});

test("search/ask dispatch to their injected backend", async () => {
  let searched = false;
  let asked = false;
  const b = backends({
    async search() {
      searched = true;
      return { items: [] };
    },
    async ask() {
      asked = true;
      return { answer: "a" };
    },
  });
  assert.equal((await dispatchTool("karda.search", { query: "q" }, oboCaller(), b)).status, 200);
  assert.equal((await dispatchTool("karda.ask", { question: "q" }, oboCaller(), b)).status, 200);
  assert.ok(searched && asked);
});

test("search without an injected backend is not_implemented, not a crash", async () => {
  const r = await dispatchTool("karda.search", { query: "q" }, serviceCaller(), backends());
  assert.equal(r.status, 501);
});

test("a token without a workspace is rejected before any tool runs", async () => {
  const r = await dispatchTool("karda.list_kbs", {}, oboCaller({ workspace: null }), backends());
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "no_workspace");
});

test("an OBO-only tool with no user (malformed OBO) is denied", async () => {
  // OBO mode should carry a user; if it does not, refuse rather than proceed.
  const r = await dispatchTool("karda.create_kb", {}, oboCaller({ user: null }), backends());
  assert.equal(r.status, 403);
});


test("durable query usage failure returns a sanitized unavailable result on both tools", async () => {
  const fail = async () => { throw new UsagePersistenceError(); };
  for (const name of ["karda.search", "karda.ask"]) {
    const result = await dispatchTool(name, { query: "q", question: "q" }, oboCaller(), backends({ search: fail, ask: fail }));
    assert.equal(result.status, 503);
    assert.deepEqual(result.body, { error: "usage_unavailable" });
  }
});

test("OBO readonly cannot write or ask and missing product roles cannot read",async()=>{
 const fail=async()=>{assert.fail("denied tool must never execute backend");};
 const readonly={roles:["readonly" as const],permissions:["product.enter" as const,"data.read" as const]};
 const b=backends({ask:fail,createKb:fail,listKbs:fail});
 for(const name of ["karda.ask","karda.create_kb"]){
  assert.equal((await dispatchTool(name,{},oboCaller({productAccess:readonly}),b)).status,403);
 }
 assert.equal((await dispatchTool("karda.list_kbs",{},oboCaller({productAccess:undefined}),b)).status,403);
 assert.equal((await dispatchTool("karda.list_kbs",{},oboCaller({productAccess:{roles:["guest"],permissions:["product.enter","guest.read"]}}),b)).status,403);
});
