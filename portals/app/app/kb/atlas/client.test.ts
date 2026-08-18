import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasApiError, atlasPost, taskIdOr, toAtlasError } from "./client";
import type { AtlasTokenSource } from "../retrieval/atlas-token";

const tokenSource: AtlasTokenSource = { async tokenFor() { return "tok"; } };

function fakeFetch(status: number, body: unknown): { fetch: typeof fetch; captured: { url: string; body?: string } } {
  const captured: { url: string; body?: string } = { url: "" };
  const fn = (async (url: string, init?: RequestInit) => {
    captured.url = String(url);
    captured.body = init?.body as string;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fn, captured };
}

test("toAtlasError parses the /v1 envelope: code, retryable, retryAfterMs", () => {
  const e = toAtlasError(429, { code: "RATE_LIMITED", message: "slow down", retryable: true, retryAfterMs: 1500 });
  assert.equal(e.code, "RATE_LIMITED");
  assert.equal(e.retryable, true);
  assert.equal(e.retryAfterMs, 1500);
  assert.equal(e.status, 429);
});

test("toAtlasError: retryAfterMs is null-safe (known Atlas defect - it can be absent)", () => {
  const e = toAtlasError(429, { code: "RATE_LIMITED", message: "m", retryable: true });
  assert.equal(e.retryAfterMs, null);
});

test("toAtlasError tolerates a non-envelope body: 5xx retryable, 4xx not", () => {
  assert.equal(toAtlasError(502, "<html>bad gateway</html>").retryable, true);
  assert.equal(toAtlasError(400, null).retryable, false);
  assert.equal(toAtlasError(400, null).code, "ATLAS_BAD_REQUEST");
});

test("atlasPost returns the 2xx body and sends the bearer + JSON body", async () => {
  const { fetch: f, captured } = fakeFetch(200, { vectors: [[1]] });
  const body = await atlasPost(
    { baseUrl: "http://100.76.219.48:3100", tokenSource, fetchImpl: f },
    "/v1/embed",
    { org: "org1", ws: "ws1" },
    { taskId: "t1", texts: ["a"] },
  );
  assert.deepEqual(body, { vectors: [[1]] });
  assert.equal(captured.url, "http://100.76.219.48:3100/v1/embed");
  assert.match(captured.body ?? "", /"taskId":"t1"/);
});

test("atlasPost throws a typed AtlasApiError on a non-2xx envelope", async () => {
  const { fetch: f } = fakeFetch(403, { code: "QUOTA_EXCEEDED", message: "q", retryable: false });
  await assert.rejects(
    atlasPost({ baseUrl: "http://100.76.219.48:3100", tokenSource, fetchImpl: f }, "/v1/chat", { org: "o", ws: "w" }, {}),
    (e: unknown) => e instanceof AtlasApiError && e.code === "QUOTA_EXCEEDED" && e.retryable === false,
  );
});

test("taskIdOr threads a caller id, clamps to 128, and falls back", () => {
  assert.equal(taskIdOr("caller-task", "fb"), "caller-task");
  assert.equal(taskIdOr("x".repeat(200), "fb").length, 128);
  assert.equal(taskIdOr(undefined, "fb"), "fb");
  assert.equal(taskIdOr("   ", "fb"), "fb");
  assert.equal(taskIdOr(42, "fb"), "fb");
});
