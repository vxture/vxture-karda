import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGES,
  nextStage,
  isTerminalStage,
  taskKey,
  configFingerprint,
  classifyOutcome,
  backoffMs,
  tierForTrigger,
  MAX_TRANSIENT_RETRIES,
} from "./stages";

test("the five stages are fetch->parse->chunk->embed->commit", () => {
  assert.deepEqual([...STAGES], ["fetch", "parse", "chunk", "embed", "commit"]);
  assert.equal(nextStage("fetch"), "parse");
  assert.equal(nextStage("chunk"), "embed");
  assert.equal(nextStage("commit"), null);
  assert.ok(isTerminalStage("commit"));
  assert.ok(!isTerminalStage("embed"));
});

test("idempotency key dedups the same work but not a retry generation", () => {
  const a = taskKey("doc1", "H1", "cfg", 0);
  const b = taskKey("doc1", "H1", "cfg", 0);
  assert.equal(a, b, "same inputs -> same key (dedup)");
  const retried = taskKey("doc1", "H1", "cfg", 1);
  assert.notEqual(a, retried, "a retry is a new task, not a dedup'd no-op");
});

test("the key changes when the content or config changes, not otherwise", () => {
  const base = taskKey("doc1", "H1", "cfgA");
  assert.notEqual(base, taskKey("doc1", "H2", "cfgA"), "content change");
  assert.notEqual(base, taskKey("doc1", "H1", "cfgB"), "config change");
  assert.notEqual(base, taskKey("doc2", "H1", "cfgA"), "different document");
});

test("config fingerprint is stable across param key order", () => {
  const one = configFingerprint({
    processingTemplateId: "t1",
    processingParams: { a: 1, b: 2 },
    embeddingModel: "m1",
  });
  const two = configFingerprint({
    processingTemplateId: "t1",
    processingParams: { b: 2, a: 1 },
    embeddingModel: "m1",
  });
  assert.equal(one, two, "key order must not change the fingerprint");
});

test("config fingerprint changes when the embedding model version changes", () => {
  const v1 = configFingerprint({ processingTemplateId: "t1", processingParams: {}, embeddingModel: "m1" });
  const v2 = configFingerprint({ processingTemplateId: "t1", processingParams: {}, embeddingModel: "m2" });
  assert.notEqual(v1, v2, "a model version bump must force reprocessing");
});

test("transient failures retry from the stopped stage, then become permanent", () => {
  const first = classifyOutcome("transient", "parse", 0);
  assert.deepEqual(first, { action: "retry", fromStage: "parse", nextGeneration: 1 });

  const atCap = classifyOutcome("transient", "embed", MAX_TRANSIENT_RETRIES - 1);
  assert.equal(atCap.action, "retry");

  const overCap = classifyOutcome("transient", "embed", MAX_TRANSIENT_RETRIES);
  assert.deepEqual(overCap, { action: "fail" });
});

test("permanent fails immediately, quota suspends and never fails", () => {
  assert.deepEqual(classifyOutcome("permanent", "parse", 0), { action: "fail" });
  // quota parks regardless of attempt count - a quota-exhausted task will
  // succeed later and must not need a human to un-fail it.
  assert.deepEqual(classifyOutcome("quota", "embed", 3), { action: "suspend" });
  assert.deepEqual(classifyOutcome("quota", "embed", MAX_TRANSIENT_RETRIES + 5), { action: "suspend" });
});

test("backoff grows exponentially and is capped", () => {
  assert.equal(backoffMs(0, 1000, 60000), 1000);
  assert.equal(backoffMs(1, 1000, 60000), 2000);
  assert.equal(backoffMs(3, 1000, 60000), 8000);
  assert.equal(backoffMs(20, 1000, 60000), 60000, "capped");
});

test("triggers route to their queue tier; bulk never shares with interactive", () => {
  assert.equal(tierForTrigger("upload"), "interactive");
  assert.equal(tierForTrigger("entry_submit"), "interactive");
  assert.equal(tierForTrigger("api"), "interactive");
  assert.equal(tierForTrigger("connector_sync"), "sync");
  assert.equal(tierForTrigger("backfill"), "bulk");
  assert.equal(tierForTrigger("rebuild"), "bulk");
  assert.equal(tierForTrigger("instantiate"), "bulk");
});
