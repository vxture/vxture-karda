import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasA4Client, extractContent } from "./generation";
import type { ChatRequest } from "./ask";

const cfg = { baseUrl: "http://100.76.219.48:3100", chatPath: "/model-platform/chat", token: "tok" };

const req: ChatRequest = {
  modelCode: "m1",
  messages: [{ role: "user", content: "hi" }],
  tenantId: "org1",
};

interface Captured {
  url: string | URL;
  init?: RequestInit;
}

function fakeFetch(status: number, body: unknown): { fetch: typeof fetch; captured: Captured } {
  const captured: Captured = { url: "" };
  const fn = (async (url: string, init?: RequestInit) => {
    captured.url = url;
    captured.init = init;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fn, captured };
}

test("extractContent handles the common response shapes", () => {
  assert.equal(extractContent({ content: "a" }), "a");
  assert.equal(extractContent({ answer: "b" }), "b");
  assert.equal(extractContent({ message: { content: "c" } }), "c");
  assert.equal(extractContent({ choices: [{ message: { content: "d" } }] }), "d");
  assert.equal(extractContent({ nope: 1 }), null);
  assert.equal(extractContent(null), null);
});

test("chat posts to base+chatPath with the internal-auth header and parses content", async () => {
  const { fetch: f, captured } = fakeFetch(200, { content: "the answer" });
  const res = await new AtlasA4Client(cfg, f).chat(req);
  assert.equal(res.content, "the answer");
  assert.equal(String(captured.url), "http://100.76.219.48:3100/model-platform/chat");
  assert.equal(captured.init?.method, "POST");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["authorization"], "Bearer tok");
  assert.match(captured.init?.body as string, /"tenantId":"org1"/);
});

test("a non-2xx status throws, and a 2xx with no content throws", async () => {
  await assert.rejects(new AtlasA4Client(cfg, fakeFetch(503, {}).fetch).chat(req), /503/);
  await assert.rejects(new AtlasA4Client(cfg, fakeFetch(200, { unexpected: true }).fetch).chat(req), /no content/);
});

test("a non-tailnet base is refused by the egress guard", async () => {
  const bad = new AtlasA4Client({ ...cfg, baseUrl: "http://evil.example.com" }, fakeFetch(200, { content: "x" }).fetch);
  await assert.rejects(bad.chat(req));
});
