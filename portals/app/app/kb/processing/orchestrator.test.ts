import { test } from "node:test";
import assert from "node:assert/strict";
import {
  runPipeline,
  UnavailableEmbeddingClient,
  QuotaError,
  UnavailableError,
  type EmbeddingClient,
  type RawSource,
  type CommitTarget,
  type CommittedChunk,
} from "./orchestrator";

const textSource = (text: string, mime = "text/markdown"): RawSource => ({
  mime,
  fetchText: async () => text,
});

class CapturingTarget implements CommitTarget {
  committed: CommittedChunk[] | null = null;
  async commit(chunks: CommittedChunk[]) {
    this.committed = chunks;
  }
}

const fakeEmbedder = (dim = 3): EmbeddingClient => ({
  async embed(texts) {
    return texts.map(() => Array.from({ length: dim }, () => 0.1));
  },
});

test("a fast-path document runs fetch->parse->chunk->embed->commit", async () => {
  const target = new CapturingTarget();
  const r = await runPipeline({
    source: textSource("# Title\n\nsome body text\n\nmore text"),
    embedder: fakeEmbedder(),
    target,
    embeddingModel: "m1",
  });
  assert.ok("done" in r && r.done);
  assert.ok(target.committed && target.committed.length >= 1);
  // vectors are attached when embedding succeeds
  assert.ok(target.committed![0].vector !== null);
});

test("a deep-path document parks in permanent failure until A2 exists", async () => {
  const r = await runPipeline({
    source: textSource("scanned", "application/pdf"),
    embedder: fakeEmbedder(),
    target: new CapturingTarget(),
    embeddingModel: "m1",
  });
  assert.ok("failed" in r && r.failed);
  assert.equal(r.stage, "parse");
  assert.equal(r.class, "permanent");
  assert.deepEqual(r.outcome, { action: "fail" });
});

test("the stub embedder suspends the task, never fails it", async () => {
  // This is the crux of the Atlas replan (TD-004): with no embedder, a document
  // gets through fetch/parse/chunk and parks at embed in a RESUMABLE state.
  const r = await runPipeline({
    source: textSource("# H\n\nbody"),
    embedder: new UnavailableEmbeddingClient(),
    target: new CapturingTarget(),
    embeddingModel: null,
  });
  assert.ok("failed" in r && r.failed);
  assert.equal(r.stage, "embed");
  assert.equal(r.class, "quota");
  assert.deepEqual(r.outcome, { action: "suspend" }, "no embedder -> suspend, not fail");
});

test("an Atlas 429 at embed is transient and retries from the embed stage", async () => {
  const throttling: EmbeddingClient = {
    async embed() {
      throw new Error("429 rate limited");
    },
  };
  const r = await runPipeline({
    source: textSource("# H\n\nbody"),
    embedder: throttling,
    target: new CapturingTarget(),
    embeddingModel: "m1",
    attempt: 1,
  });
  assert.ok("failed" in r && r.failed);
  assert.equal(r.stage, "embed");
  assert.equal(r.class, "transient");
  assert.deepEqual(r.outcome, { action: "retry", fromStage: "embed", nextGeneration: 2 });
});

test("embedding quota exhaustion suspends", async () => {
  const exhausted: EmbeddingClient = {
    async embed() {
      throw new QuotaError("embedding quota exhausted");
    },
  };
  const r = await runPipeline({
    source: textSource("# H\n\nbody"),
    embedder: exhausted,
    target: new CapturingTarget(),
    embeddingModel: "m1",
  });
  assert.ok("failed" in r && r.failed && r.outcome.action === "suspend");
});

test("a fetch failure is transient and resumes from fetch", async () => {
  const badSource: RawSource = {
    mime: "text/plain",
    fetchText: async () => {
      throw new Error("connection reset");
    },
  };
  const r = await runPipeline({
    source: badSource,
    embedder: fakeEmbedder(),
    target: new CapturingTarget(),
    embeddingModel: "m1",
    attempt: 0,
  });
  assert.ok("failed" in r && r.failed);
  assert.equal(r.stage, "fetch");
  assert.deepEqual(r.outcome, { action: "retry", fromStage: "fetch", nextGeneration: 1 });
});

test("UnavailableError is quota-classed so it suspends", async () => {
  const unavailable: EmbeddingClient = {
    async embed() {
      throw new UnavailableError("down");
    },
  };
  const r = await runPipeline({
    source: textSource("# H\n\nbody"),
    embedder: unavailable,
    target: new CapturingTarget(),
    embeddingModel: "m1",
  });
  assert.ok("failed" in r && r.failed && r.outcome.action === "suspend");
});
