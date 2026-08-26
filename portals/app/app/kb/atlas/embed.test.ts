import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasEmbedClient, extractVectors, mapEmbedError } from "./embed";
import { AtlasApiError } from "./client";
import { QuotaError, UnavailableError } from "../processing/orchestrator";
import type { AtlasTokenSource } from "../retrieval/atlas-token";

const tokenSource: AtlasTokenSource = { async tokenFor() { return "tok"; } };
const ctx = { context: async () => ({ org: "org1", ws: "ws1" }), taskId: "karda:ingest:d1" };

function fakeFetch(status: number, body: unknown): { fetch: typeof fetch; captured: { body?: string } } {
  const captured: { body?: string } = {};
  const fn = (async (_url: string, init?: RequestInit) => {
    captured.body = init?.body as string;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fn, captured };
}

function client(status: number, body: unknown) {
  const { fetch: f, captured } = fakeFetch(status, body);
  return {
    client: new AtlasEmbedClient({ baseUrl: "http://100.76.219.48:3100", tokenSource, fetchImpl: f }, ctx, "/v1/embed"),
    captured,
  };
}

test("extractVectors handles the common embed response shapes", () => {
  assert.deepEqual(extractVectors({ vectors: [[1, 2]] }), [[1, 2]]);
  assert.deepEqual(extractVectors({ embeddings: [[3]] }), [[3]]);
  assert.deepEqual(extractVectors({ data: [{ embedding: [4] }, { embedding: [5] }] }), [[4], [5]]);
  assert.equal(extractVectors({ nope: 1 }), null);
  assert.equal(extractVectors({ data: [{ embedding: "bad" }] }), null);
});

test("mapEmbedError: QUOTA_EXCEEDED suspends as quota (the real code, not QUOTA_EXHAUSTED - karda#100)", () => {
  const mapped = mapEmbedError(new AtlasApiError("QUOTA_EXCEEDED", 403, false, "q"));
  assert.ok(mapped instanceof QuotaError);
});

test("mapEmbedError: capability/authz gaps suspend; retryable + validation stay transient", () => {
  assert.ok(mapEmbedError(new AtlasApiError("NOT_ENTITLED", 403, false, "n")) instanceof UnavailableError);
  assert.ok(mapEmbedError(new AtlasApiError("MODEL_NOT_IMPLEMENTED", 501, false, "n")) instanceof UnavailableError);
  const rate = mapEmbedError(new AtlasApiError("RATE_LIMITED", 429, true, "r"));
  assert.ok(rate instanceof Error && !(rate instanceof UnavailableError) && !(rate instanceof QuotaError));
  const invalid = mapEmbedError(new AtlasApiError("EMBED_TEXTS_INVALID", 400, false, "v"));
  assert.ok(invalid instanceof Error && !(invalid instanceof UnavailableError) && !(invalid instanceof QuotaError));
});

test("a KB pin posts modelCode and the pin is the resolved space when the echo is absent", async () => {
  const { client: c, captured } = client(200, { vectors: [[1], [2]] });
  const out = await c.embed(["a", "b"], "embedding-3");
  assert.deepEqual(out.vectors, [[1], [2]]);
  assert.equal(out.modelCode, "embedding-3");
  const body = JSON.parse(captured.body ?? "{}");
  assert.equal(body.taskId, "karda:ingest:d1");
  assert.deepEqual(body.texts, ["a", "b"]);
  assert.equal(body.workspaceId, "ws1");
  assert.equal(body.modelCode, "embedding-3");
  assert.equal(body.endpointCode, undefined, "a pin sends no endpoint");
});

test("no pin = grant-routed (KD-018): sends the fixed karda.embed profile, records the RESOLVED model", async () => {
  const { client: c, captured } = client(200, { vectors: [[1]], modelCode: "embedding-3" });
  const out = await c.embed(["a"], null);
  assert.equal(out.modelCode, "embedding-3", "the response echo is the vector-space identity");
  const body = JSON.parse(captured.body ?? "{}");
  assert.equal(body.endpointCode, "embedding/default");
  assert.equal(body.modelCode, undefined, "grant routing sends no modelCode");
});

test("a grant-routed response WITHOUT a modelCode echo is refused - never store vectors under a guessed space", async () => {
  const { client: c } = client(200, { vectors: [[1]] });
  await assert.rejects(c.embed(["a"], null), /no modelCode/);
});

test("a vector-count mismatch throws (transient), never a silent partial index", async () => {
  const { client: c } = client(200, { vectors: [[1]] });
  await assert.rejects(c.embed(["a", "b"], "m"), /vector count/);
});

test("an Atlas quota rejection surfaces as QuotaError through embed()", async () => {
  const { client: c } = client(403, { code: "QUOTA_EXCEEDED", message: "q", retryable: false });
  await assert.rejects(c.embed(["a"], "m"), QuotaError);
});

test("an unresolvable tenant context parks rather than crashes", async () => {
  const { fetch: f } = fakeFetch(200, { vectors: [[1]] });
  const c = new AtlasEmbedClient(
    { baseUrl: "http://100.76.219.48:3100", tokenSource, fetchImpl: f },
    { context: async () => { throw new Error("no tenant"); }, taskId: "t" },
    "/v1/embed",
  );
  await assert.rejects(c.embed(["a"], "m"), UnavailableError);
});
