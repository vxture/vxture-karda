import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRequest, isNotification, toolResult } from "./protocol";
import { authenticateChannel } from "./auth";
import { MCP_TOOLS, callMcpTool, channelCaller, isMcpTool } from "./tools";
import type { ToolBackends } from "../tools/dispatch";
import type { CallerContext } from "../tools/s2s";

// --- protocol ----------------------------------------------------------------

test("parseRequest accepts a request object and rejects batches/garbage", () => {
  assert.ok(parseRequest({ jsonrpc: "2.0", id: 1, method: "tools/list" }));
  assert.equal(parseRequest([{ jsonrpc: "2.0", id: 1, method: "x" }]), null, "batch rejected");
  assert.equal(parseRequest({ jsonrpc: "1.0", id: 1, method: "x" }), null);
  assert.equal(parseRequest({ jsonrpc: "2.0", id: 1 }), null, "no method");
  assert.equal(parseRequest({ jsonrpc: "2.0", id: 1, method: "x", params: [] }), null, "array params");
  assert.equal(parseRequest("nope"), null);
});

test("a request without an id is a notification", () => {
  const n = parseRequest({ jsonrpc: "2.0", method: "notifications/initialized" });
  assert.ok(n && isNotification(n));
  const r = parseRequest({ jsonrpc: "2.0", id: 0, method: "ping" });
  assert.ok(r && !isNotification(r));
});

test("toolResult mirrors the payload in content[0].text and structuredContent", () => {
  const r = toolResult({ a: 1 });
  assert.equal(r.content[0].text, JSON.stringify({ a: 1 }));
  assert.deepEqual(r.structuredContent, { a: 1 });
  assert.equal(r.isError, undefined);
  assert.equal(toolResult({ e: 1 }, true).isError, true);
});

// --- auth --------------------------------------------------------------------

function headers(map: Record<string, string>): { get(n: string): string | null } {
  const lower = Object.fromEntries(Object.entries(map).map(([k, v]) => [k.toLowerCase(), v]));
  return { get: (n) => lower[n.toLowerCase()] ?? null };
}

test("channel auth: unset secret is 503 fail-closed, not a 401", () => {
  const saved = process.env.RUNOS_CHANNEL_TOKEN;
  try {
    delete process.env.RUNOS_CHANNEL_TOKEN;
    const r = authenticateChannel(headers({ authorization: "Bearer x" }));
    assert.ok(!r.ok && r.status === 503);
  } finally {
    if (saved !== undefined) process.env.RUNOS_CHANNEL_TOKEN = saved;
  }
});

test("channel auth: bearer verified constant-time; wrong/missing token 401; internal-auth header 403", () => {
  const saved = process.env.RUNOS_CHANNEL_TOKEN;
  try {
    process.env.RUNOS_CHANNEL_TOKEN = "secret-1";
    assert.ok(authenticateChannel(headers({ authorization: "Bearer secret-1" })).ok);
    const wrong = authenticateChannel(headers({ authorization: "Bearer nope" }));
    assert.ok(!wrong.ok && wrong.status === 401);
    const missing = authenticateChannel(headers({}));
    assert.ok(!missing.ok && missing.status === 401);
    const internal = authenticateChannel(
      headers({ authorization: "Bearer secret-1", "x-vxture-internal-auth": "t" }),
    );
    assert.ok(!internal.ok && internal.status === 403, "the platform shared secret is refused as a category error");
  } finally {
    if (saved === undefined) delete process.env.RUNOS_CHANNEL_TOKEN;
    else process.env.RUNOS_CHANNEL_TOKEN = saved;
  }
});

// --- tools -------------------------------------------------------------------

test("the tools/list surface is exactly the two registered capabilities' operations", () => {
  assert.deepEqual(
    MCP_TOOLS.map((t) => t.name),
    ["search", "ask", "list_kbs", "write_document", "create_entry"],
  );
  for (const t of MCP_TOOLS) {
    const schema = t.inputSchema as { required?: string[] };
    assert.ok(schema.required?.includes("org_id"), `${t.name} requires org_id`);
    assert.ok(schema.required?.includes("workspace_id"), `${t.name} requires workspace_id`);
  }
  assert.ok(isMcpTool("search") && !isMcpTool("karda.search"));
});

test("channelCaller derives a service-mode caller from arguments, or null", () => {
  const c = channelCaller({ org_id: "org1", workspace_id: "ws1" });
  assert.deepEqual(c, { callerProduct: "runos", org: "org1", workspace: "ws1", user: null, mode: "service" });
  assert.equal(channelCaller({ org_id: "org1" }), null);
  assert.equal(channelCaller({ org_id: "", workspace_id: "ws1" }), null);
});

function fakeBackends(over: Partial<ToolBackends> = {}): {
  backends: ToolBackends;
  calls: { name: string; caller?: CallerContext; args?: Record<string, unknown> }[];
} {
  const calls: { name: string; caller?: CallerContext; args?: Record<string, unknown> }[] = [];
  const backends: ToolBackends = {
    async listKbs(ws) {
      calls.push({ name: "listKbs", args: { ws } });
      return [{ id: "kb1" }];
    },
    async search(caller, args) {
      calls.push({ name: "search", caller, args });
      return { items: [], degraded: null, partial: false, ignored_kb_ids: [] };
    },
    async writeDocument(caller, args) {
      calls.push({ name: "writeDocument", caller, args });
      return { status: 201, body: { document: { id: "d1", content_state: "processing" } } };
    },
    async createEntry(caller, args) {
      calls.push({ name: "createEntry", caller, args });
      return { status: 400, body: { error: "invalid_request", detail: "bad" } };
    },
    ...over,
  };
  return { backends, calls };
}

const ctxArgs = { org_id: "org1", workspace_id: "ws1" };

test("search maps kb_ids to the preset merge and threads task_id", async () => {
  const { backends, calls } = fakeBackends();
  const r = await callMcpTool("search", { ...ctxArgs, query: "q", kb_ids: ["kb1"], task_id: "t9" }, backends);
  assert.notEqual(r.isError, true);
  const call = calls.find((c) => c.name === "search");
  assert.deepEqual(call?.args?.preset_kb_ids, ["kb1"]);
  assert.equal(call?.args?.task_id, "t9");
  assert.equal(call?.caller?.mode, "service");
});

test("search/ask without kb_ids are refused: this channel names its libraries explicitly", async () => {
  const { backends } = fakeBackends();
  const r = await callMcpTool("search", { ...ctxArgs, query: "q" }, backends);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /kb_ids/);
});

test("missing org/workspace context is an isError result, not a crash", async () => {
  const { backends } = fakeBackends();
  const r = await callMcpTool("search", { query: "q", kb_ids: ["kb1"] }, backends);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /org_id and workspace_id/);
});

test("write_document runs in service mode on this channel (the owner-directed write path)", async () => {
  const { backends, calls } = fakeBackends();
  const r = await callMcpTool("write_document", { ...ctxArgs, kb_id: "kb1", content: "text" }, backends);
  assert.notEqual(r.isError, true);
  const call = calls.find((c) => c.name === "writeDocument");
  assert.equal(call?.caller?.mode, "service");
  assert.equal(call?.caller?.user, null);
  assert.equal((r.structuredContent as { document?: { content_state?: string } }).document?.content_state, "processing");
});

test("a backend 4xx becomes an isError tool result carrying the backend's body", async () => {
  const { backends } = fakeBackends();
  const r = await callMcpTool("create_entry", { ...ctxArgs, kb_id: "kb1", template_id: "faq", fields: {} }, backends);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /invalid_request/);
});

test("ask without a configured generation client is an honest not_implemented", async () => {
  const { backends } = fakeBackends(); // no ask
  const r = await callMcpTool("ask", { ...ctxArgs, question: "?", kb_ids: ["kb1"] }, backends);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /not_implemented/);
});

test("a thrown backend failure becomes capability_failure, never a protocol error", async () => {
  const { backends } = fakeBackends({
    async search() {
      throw new Error("atlas down");
    },
  });
  const r = await callMcpTool("search", { ...ctxArgs, query: "q", kb_ids: ["kb1"] }, backends);
  assert.equal(r.isError, true);
  assert.match(r.content[0].text, /capability_failure/);
});
