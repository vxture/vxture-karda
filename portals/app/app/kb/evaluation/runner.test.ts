import test from "node:test";
import assert from "node:assert/strict";
import { runEvaluation, type RetrievalPort, type EvalQuestionInput } from "./runner";

const q = (id: string, expected: string[]): EvalQuestionInput => ({ id, question: `Q ${id}`, expectedEvidence: expected });

function port(over: Partial<RetrievalPort> = {}): RetrievalPort {
  return {
    async search() { return { docIds: [], degraded: false }; },
    async ask() { return { docIds: [], excerpt: null, degraded: false }; },
    ...over,
  };
}

let clock = 0;
const tick = () => (clock += 25);

test("questions with no expected evidence are SKIPPED and reported, not scored", () => {
  // Silently dropping them would make "12 of 20 scored" invisible, and counting
  // them would make an unfinished set look like a regression.
  return runEvaluation([q("a", ["d1"]), q("b", [])], port()).then((r) => {
    assert.equal(r.outcomes.length, 1);
    assert.equal(r.skipped, 1);
  });
});

test("recall and citations are scored against the SAME chain the agent uses", async () => {
  const asked: string[] = [];
  const r = await runEvaluation(
    [q("a", ["d1"])],
    port({
      async search(question) { asked.push(`search:${question}`); return { docIds: ["d1", "d2"], degraded: false }; },
      async ask(question) { asked.push(`ask:${question}`); return { docIds: ["d1"], excerpt: "x", degraded: false }; },
    }),
  );
  assert.deepEqual(asked, ["search:Q a", "ask:Q a"]);
  assert.equal(r.outcomes[0].recallHit, true);
  assert.equal(r.outcomes[0].citedExpected, 1);
  assert.equal(r.metrics.recallHitPct, 100);
});

test("ask returning NULL means answering is unavailable - metrics go NULL, not 0", () => {
  // The distinction the whole design rests on: "generation is off" and
  // "answered but cited nothing" produce the same empty list.
  return runEvaluation([q("a", ["d1"])], port({ async ask() { return null; } })).then((r) => {
    assert.equal(r.answeringAvailable, false);
    assert.equal(r.metrics.groundedAnswerPct, null);
    assert.equal(r.metrics.citationPrecisionPct, null);
    assert.equal(r.metrics.recallHitPct, 0, "recall is still measurable without generation");
  });
});

test("ask returning an EMPTY list means answering worked and cited nothing", async () => {
  const r = await runEvaluation([q("a", ["d1"])], port({ async ask() { return { docIds: [], excerpt: null, degraded: false }; } }));
  assert.equal(r.answeringAvailable, true);
  assert.equal(r.metrics.groundedAnswerPct, 0);
});

test("degradation ANYWHERE marks the whole run degraded", async () => {
  // Only one question needs to have run on a degraded chain for the run to be
  // incomparable with a clean one.
  let n = 0;
  const r = await runEvaluation(
    [q("a", ["d1"]), q("b", ["d2"])],
    port({ async search() { n += 1; return { docIds: [], degraded: n === 2 }; } }),
  );
  assert.equal(r.degraded, true);
});

test("a clean run is not marked degraded", async () => {
  const r = await runEvaluation([q("a", ["d1"])], port({ async search() { return { docIds: ["d1"], degraded: false }; } }));
  assert.equal(r.degraded, false);
});

test("questions run SEQUENTIALLY - latency would be meaningless under fan-out", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const p = port({
    async search() {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight -= 1;
      return { docIds: [], degraded: false };
    },
  });
  await runEvaluation([q("a", ["d1"]), q("b", ["d2"]), q("c", ["d3"])], p);
  assert.equal(maxInFlight, 1, "a fan-out would measure contention as much as quality");
});

test("per-question latency is recorded", async () => {
  clock = 0;
  const r = await runEvaluation([q("a", ["d1"])], port(), tick);
  assert.equal(r.outcomes[0].latencyMs, 25);
});

test("an EMPTY set reports answering as unavailable rather than a confident 0%", async () => {
  // Nothing was asked, so nothing was learned about the host. A 0% over no data
  // is the most misleading number a report can carry.
  const r = await runEvaluation([], port());
  assert.equal(r.answeringAvailable, false);
  assert.equal(r.metrics.groundedAnswerPct, null);
  assert.equal(r.metrics.questionCount, 0);
});

test("the answer excerpt is carried through for the gap review", async () => {
  const r = await runEvaluation(
    [q("a", ["d1"])],
    port({ async ask() { return { docIds: ["d9"], excerpt: "回答摘录", degraded: false }; } }),
  );
  assert.equal(r.outcomes[0].answerExcerpt, "回答摘录");
  assert.equal(r.outcomes[0].citedExpected, 0, "cited the wrong document");
  assert.equal(r.outcomes[0].grounded, true, "but it WAS grounded - different question");
});
