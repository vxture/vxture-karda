import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { OssObjectStore, signOssRequest } from "./oss";
import { contentHashOf } from "./objectstore";

// --- signing: locked to Aliyun's OFFICIAL V4 worked example ------------------
// (help.aliyun.com "Implement the V4 signature calculation"). The doc's final
// signature was computed with a masked real secret, so the assertable golden
// value is the CanonicalRequest sha256 the doc prints: c46d9639... - that pins
// the canonicalization, which is the part that actually goes wrong.

test("canonicalization reproduces the official example's CanonicalRequest hash exactly", () => {
  const { canonicalRequest } = signOssRequest({
    method: "PUT",
    bucket: "examplebucket",
    key: "exampleobject",
    region: "cn-hangzhou",
    accessKeyId: "LTAI",
    accessKeySecret: "yourAccessKeySecret",
    timestamp: "20250411T064124Z",
    headers: {
      "content-disposition": "attachment",
      "content-length": "3",
      "content-md5": "ICy5YqxZB1uWSwcVLSNLcA==",
      "content-type": "text/plain",
    },
  });
  // NOTE: the official example also signs content-disposition/content-length as
  // AdditionalHeaders; our client signs none, so strip that one line before
  // comparing - everything else must match byte-for-byte.
  const docForm = canonicalRequest.replace("\n\nUNSIGNED-PAYLOAD", "\ncontent-disposition;content-length\nUNSIGNED-PAYLOAD");
  assert.equal(
    createHash("sha256").update(docForm).digest("hex"),
    "c46d96390bdbc2d739ac9363293ae9d710b14e48081fcb22cd8ad54b63136eca",
  );
});

test("authorization carries the V4 credential scope and a 64-hex signature", () => {
  const { authorization } = signOssRequest({
    method: "GET",
    bucket: "b",
    key: "ws/kb/ab/abcd",
    region: "cn-beijing",
    accessKeyId: "AKID",
    accessKeySecret: "SK",
    timestamp: "20260819T000000Z",
  });
  assert.match(authorization, /^OSS4-HMAC-SHA256 Credential=AKID\/20260819\/cn-beijing\/oss\/aliyun_v4_request,Signature=[0-9a-f]{64}$/);
});

// --- store behavior over a fake fetch ---------------------------------------

function fakeFetch(status: number, body?: Buffer) {
  const calls: { url: string; method?: string; headers: Record<string, string>; body?: unknown }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method, headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body });
    return {
      ok: status >= 200 && status < 300,
      status,
      arrayBuffer: async () => {
        const b = body ?? Buffer.alloc(0);
        // account for Node's Buffer pooling: slice by byteOffset, not from 0.
        return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
      },
    } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fn, calls };
}

const cfg = (f: typeof fetch) => ({
  bucket: "karda-objects",
  region: "cn-beijing",
  endpoint: "oss-cn-beijing.aliyuncs.com",
  accessKeyId: "AKID",
  accessKeySecret: "SK",
  fetchImpl: f,
  now: () => new Date("2026-08-19T00:00:00Z"),
});

test("put uses the same content-addressed key shape as the filesystem store", async () => {
  const { fetch: f, calls } = fakeFetch(200);
  const store = new OssObjectStore(cfg(f));
  const bytes = Buffer.from("hello");
  const out = await store.put("ws1", "kb1", bytes);
  const hash = contentHashOf(bytes);
  assert.equal(out.key, `ws1/kb1/${hash.slice(0, 2)}/${hash}`);
  assert.equal(out.contentHash, hash);
  const call = calls[0];
  assert.equal(call.method, "PUT");
  assert.equal(call.url, `https://karda-objects.oss-cn-beijing.aliyuncs.com/${out.key}`);
  assert.match(call.headers["authorization"], /^OSS4-HMAC-SHA256 /);
  assert.equal(call.headers["x-oss-content-sha256"], "UNSIGNED-PAYLOAD");
  assert.equal(call.headers["x-oss-date"], "20260819T000000Z");
});

test("get returns bytes on 200, null on 404, throws on other errors", async () => {
  const body = Buffer.from("data");
  const ok = new OssObjectStore(cfg(fakeFetch(200, body).fetch));
  assert.deepEqual(await ok.get("ws/kb/ab/abcd"), body);
  const missing = new OssObjectStore(cfg(fakeFetch(404).fetch));
  assert.equal(await missing.get("ws/kb/ab/abcd"), null);
  const denied = new OssObjectStore(cfg(fakeFetch(403).fetch));
  await assert.rejects(denied.get("ws/kb/ab/abcd"), /403/);
});

test("delete treats 204 and 404 as success (OSS delete is idempotent)", async () => {
  assert.equal(await new OssObjectStore(cfg(fakeFetch(204).fetch)).delete("k/a/b/c"), true);
  assert.equal(await new OssObjectStore(cfg(fakeFetch(404).fetch)).delete("k/a/b/c"), true);
  await assert.rejects(new OssObjectStore(cfg(fakeFetch(403).fetch)).delete("k/a/b/c"), /403/);
});

test("a traversal key is refused before any network call", async () => {
  const { fetch: f, calls } = fakeFetch(200);
  const store = new OssObjectStore(cfg(f));
  await assert.rejects(store.get("../secrets"), /invalid object key/);
  assert.equal(calls.length, 0);
});
