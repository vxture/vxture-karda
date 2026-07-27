import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasA4Client, extractContent } from "./generation";
import type { ChatRequest } from "./ask";
import type { AtlasTokenSource, TokenContext } from "./atlas-token";

// A fake token source that records the (org, ws) it was asked for and returns a
// canned bearer - the real minting is covered in atlas-token.test.ts.
function fakeTokenSource(token = "tok"): { source: AtlasTokenSource; seen: TokenContext[] } {
  const seen: TokenContext[] = [];
  const source: AtlasTokenSource = {
    async tokenFor(ctx) {
      seen.push(ctx);
      return token;
    },
  };
  return { source, seen };
}

function makeCfg(token = "tok") {
  const { source, seen } = fakeTokenSource(token);
  return {
    cfg: { baseUrl: "http://100.76.219.48:3100", chatPath: "/model-platform/chat", tokenSource: source },
    seen,
  };
}

const req: ChatRequest = {
  modelCode: "m1",
  messages: [{ role: "user", content: "hi" }],
  tenantId: "org1",
  workspaceId: "ws1",
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

test("chat mints an aud=atlas bearer per (org, ws) and posts it to base+chatPath", async () => {
  const { cfg, seen } = makeCfg();
  const { fetch: f, captured } = fakeFetch(200, { content: "the answer" });
  const res = await new AtlasA4Client(cfg, f).chat(req);
  assert.equal(res.content, "the answer");
  assert.equal(String(captured.url), "http://100.76.219.48:3100/model-platform/chat");
  assert.equal(captured.init?.method, "POST");
  const headers = captured.init?.headers as Record<string, string>;
  assert.equal(headers["authorization"], "Bearer tok");
  assert.match(captured.init?.body as string, /"tenantId":"org1"/);
  // the token was requested for exactly this call's org/ws context
  assert.deepEqual(seen, [{ org: "org1", ws: "ws1" }]);
});

test("a missing workspaceId mints for the empty-ws context (does not throw)", async () => {
  const { cfg, seen } = makeCfg();
  const { fetch: f } = fakeFetch(200, { content: "x" });
  await new AtlasA4Client(cfg, f).chat({ ...req, workspaceId: undefined });
  assert.deepEqual(seen, [{ org: "org1", ws: "" }]);
});

test("a non-2xx status throws, and a 2xx with no content throws", async () => {
  const { cfg } = makeCfg();
  await assert.rejects(new AtlasA4Client(cfg, fakeFetch(503, {}).fetch).chat(req), /503/);
  await assert.rejects(new AtlasA4Client(cfg, fakeFetch(200, { unexpected: true }).fetch).chat(req), /no content/);
});

test("a non-tailnet base is refused by the egress guard", async () => {
  const { cfg } = makeCfg();
  const bad = new AtlasA4Client({ ...cfg, baseUrl: "http://evil.example.com" }, fakeFetch(200, { content: "x" }).fetch);
  await assert.rejects(bad.chat(req));
});
