import { test } from "node:test";
import assert from "node:assert/strict";
import { AtlasReranker, extractScores, rerankSelection, RERANK_CANDIDATE_CAP } from "./rerank";
import type { AtlasTokenSource } from "../retrieval/atlas-token";

const tokenSource: AtlasTokenSource = { async tokenFor() { return "tok"; } };
const call = { context: async () => ({ org: "org1", ws: "ws1" }), taskId: "t1" };

function fakeFetch(status: number, body: unknown): { fetch: typeof fetch; captured: { body?: string } } {
  const captured: { body?: string } = {};
  const fn = (async (_url: string, init?: RequestInit) => {
    captured.body = init?.body as string;
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetch: fn, captured };
}

const texts = {
  async resolve(ids: string[]) {
    return ids.map((id) => ({ id, text: `text-${id}` }));
  },
};

test("extractScores handles results[{index,score}] and bare scores[]", () => {
  assert.deepEqual(extractScores({ results: [{ index: 1, score: 0.9 }] }, 2), [{ index: 1, score: 0.9 }]);
  assert.deepEqual(extractScores({ results: [{ index: 0, relevanceScore: 0.5 }] }, 1), [{ index: 0, score: 0.5 }]);
  assert.deepEqual(extractScores({ scores: [0.1, 0.2] }, 2), [
    { index: 0, score: 0.1 },
    { index: 1, score: 0.2 },
  ]);
  assert.equal(extractScores({ results: [{ index: 5, score: 1 }] }, 2), null, "out-of-range index is rejected");
  assert.equal(extractScores({ scores: [0.1] }, 2), null, "misaligned scores are rejected");
});

test("rerankSelection: grant-routed by default (karda.rerank); env pins are break-glass (KD-018)", () => {
  const saved = { tp: process.env.ATLAS_RERANK_TASK_PROFILE, mc: process.env.ATLAS_RERANK_MODEL };
  try {
    process.env.ATLAS_RERANK_TASK_PROFILE = "rerank-profile";
    assert.deepEqual(rerankSelection(), { taskProfile: "rerank-profile" });
    delete process.env.ATLAS_RERANK_TASK_PROFILE;
    process.env.ATLAS_RERANK_MODEL = "rr-1";
    assert.deepEqual(rerankSelection(), { modelCode: "rr-1" });
    delete process.env.ATLAS_RERANK_MODEL;
    assert.deepEqual(rerankSelection(), { taskProfile: "karda.rerank" }, "unconfigured = the fixed profile, never null");
  } finally {
    if (saved.tp === undefined) delete process.env.ATLAS_RERANK_TASK_PROFILE;
    else process.env.ATLAS_RERANK_TASK_PROFILE = saved.tp;
    if (saved.mc === undefined) delete process.env.ATLAS_RERANK_MODEL;
    else process.env.ATLAS_RERANK_MODEL = saved.mc;
  }
});

test("rerank posts taskId/query/candidates/workspaceId + selection and maps indexes back to ids", async () => {
  const { fetch: f, captured } = fakeFetch(200, { results: [{ index: 1, score: 0.9 }, { index: 0, score: 0.2 }] });
  const rr = new AtlasReranker(
    { baseUrl: "http://100.76.219.48:3100", tokenSource, fetchImpl: f },
    call,
    texts,
    { modelCode: "rr-1" },
    "/v1/rerank",
  );
  const out = await rr.rerank("q", [
    { id: "c1", kbId: "kb1" },
    { id: "c2", kbId: "kb1" },
  ]);
  assert.deepEqual(out, [
    { id: "c2", score: 0.9 },
    { id: "c1", score: 0.2 },
  ]);
  const body = JSON.parse(captured.body ?? "{}");
  assert.equal(body.taskId, "t1");
  assert.equal(body.query, "q");
  assert.deepEqual(body.candidates, ["text-c1", "text-c2"]);
  assert.equal(body.workspaceId, "ws1");
  assert.equal(body.modelCode, "rr-1");
});

test("the candidate pool is defensively capped at 100 (Atlas hard-rejects, never truncates)", async () => {
  const { fetch: f, captured } = fakeFetch(200, { scores: Array(RERANK_CANDIDATE_CAP).fill(0.5) });
  const rr = new AtlasReranker(
    { baseUrl: "http://100.76.219.48:3100", tokenSource, fetchImpl: f },
    call,
    texts,
    { modelCode: "rr-1" },
    "/v1/rerank",
  );
  const pool = Array.from({ length: 150 }, (_, i) => ({ id: `c${i}`, kbId: "kb1" }));
  const out = await rr.rerank("q", pool);
  assert.equal(out.length, RERANK_CANDIDATE_CAP);
  assert.equal(JSON.parse(captured.body ?? "{}").candidates.length, RERANK_CANDIDATE_CAP);
});

test("an Atlas failure throws - the chain's degrade contract turns it into RRF order", async () => {
  const { fetch: f } = fakeFetch(503, { code: "PROVIDER_UNAVAILABLE", message: "down", retryable: true });
  const rr = new AtlasReranker(
    { baseUrl: "http://100.76.219.48:3100", tokenSource, fetchImpl: f },
    call,
    texts,
    { modelCode: "rr-1" },
    "/v1/rerank",
  );
  await assert.rejects(
    rr.rerank("q", [{ id: "c1", kbId: "kb1" }]),
    (e: unknown) => (e as { code?: string }).code === "PROVIDER_UNAVAILABLE",
  );
});
