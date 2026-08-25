import { aggregate, scoreQuestion, answerableQuestions, type QuestionOutcome, type RunAggregate } from "./scoring";

// The evaluation runner: put an authored question set through THE SAME retrieval
// chain an agent uses, and record what came back.
//
// "The same chain" is the whole validity claim. A runner with its own recall
// path measures the runner. So this takes the search/ask functions as ports and
// the route hands it the real ones - the same `consoleSearch` / `consoleAsk` the
// 检验台 calls, which are the session-facing twins of the agent tool face.
//
// THE RUNNER MAPS CHUNKS BACK TO DOCUMENTS before scoring. Recall returns chunk
// ids; expected evidence is authored at document level because a chunk id is
// reborn on every rebuild. Doing this mapping here rather than in scoring keeps
// the scoring rules free of storage concerns.

export interface EvalQuestionInput {
  id: string;
  question: string;
  expectedEvidence: string[];
}

/** What a run needs from the retrieval chain. Both return DOCUMENT ids - the
 *  adapter is the caller's job, because only it knows how a chunk id resolves. */
export interface RetrievalPort {
  /** Recalled document ids, in rank order. */
  search(question: string): Promise<{ docIds: string[]; degraded: boolean }>;
  /**
   * Cited document ids for a grounded answer, or null when answering is not
   * available on this host (Atlas A4 unconfigured).
   *
   * NULL rather than an empty array, and the distinction is load-bearing:
   * "answering is off" and "answered but cited nothing" produce the same empty
   * list and must not produce the same metric. See scoring.aggregate.
   */
  ask(question: string): Promise<{ docIds: string[]; excerpt: string | null; degraded: boolean } | null>;
}

export interface RunOutcome {
  outcomes: QuestionOutcome[];
  metrics: RunAggregate;
  /** True when ANY question ran on a degraded chain. Carried per run because a
   *  run whose rerank was unavailable measured a different chain, and comparing
   *  it as an equal is how a phantom regression gets reported. */
  degraded: boolean;
  answeringAvailable: boolean;
  /** Questions skipped for asserting no expected evidence. Reported rather than
   *  silently dropped - "12 of 20 scored" is a fact the reader needs. */
  skipped: number;
}

/**
 * Run one set. Sequential on purpose: a run is a measurement, and firing twenty
 * concurrent searches at the same chain measures contention as much as quality.
 * Latency per question is recorded, and it would be meaningless under a fan-out.
 */
export async function runEvaluation(
  questions: readonly EvalQuestionInput[],
  retrieval: RetrievalPort,
  now: () => number = Date.now,
): Promise<RunOutcome> {
  const scorable = answerableQuestions(questions);
  const outcomes: QuestionOutcome[] = [];
  let degraded = false;
  // Resolved from the FIRST ask, then held: whether generation is configured is
  // a property of the host, not of a question.
  let answeringAvailable: boolean | null = null;

  for (const q of scorable) {
    const started = now();
    const recall = await retrieval.search(q.question);
    if (recall.degraded) degraded = true;

    const answer = await retrieval.ask(q.question);
    if (answeringAvailable === null) answeringAvailable = answer !== null;
    if (answer?.degraded) degraded = true;

    outcomes.push(
      scoreQuestion({
        questionId: q.id,
        expectedDocIds: q.expectedEvidence,
        recalledDocIds: recall.docIds,
        citedDocIds: answer?.docIds ?? [],
        latencyMs: now() - started,
        answerExcerpt: answer?.excerpt ?? null,
      }),
    );
  }

  // An empty run never called ask, so nothing was learned about the host. Treat
  // it as unavailable so the metrics come back NULL rather than a confident 0%
  // over no data.
  const available = answeringAvailable ?? false;

  return {
    outcomes,
    metrics: aggregate(outcomes, available),
    degraded,
    answeringAvailable: available,
    skipped: questions.length - scorable.length,
  };
}
