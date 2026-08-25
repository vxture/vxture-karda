import { getPrismaClient } from "../../lib/db";
import type { QuestionOutcome, RunAggregate } from "./scoring";

// Persistence for the evaluation runner's four tables.
//
// Prisma-only, with no in-memory twin, and that is deliberate rather than a
// shortcut: an evaluation whose results do not persist cannot answer "did this
// change help", which is the entire reason the tables exist. Offline the feature
// reports itself unavailable instead of pretending - see the routes.

export interface EvalSetRow {
  id: string;
  workspaceId: string;
  name: string;
  description: string | null;
  kbScope: string[];
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvalQuestionRow {
  id: string;
  setId: string;
  question: string;
  expectedEvidence: string[];
  note: string | null;
  position: number;
}

export interface EvalRunRow {
  id: string;
  setId: string;
  baselineLabel: string;
  verificationFilter: string;
  topK: number;
  state: string;
  questionCount: number;
  recallHitPct: number | null;
  citationPrecisionPct: number | null;
  groundedAnswerPct: number | null;
  gapCount: number;
  degraded: boolean;
  errorCode: string | null;
  createdBy: string | null;
  startedAt: string;
  finishedAt: string | null;
}

/** JSONB comes back as `unknown`; coerce to a string array without trusting it.
 *  A malformed scope must degrade to "no scope", never throw a page down. */
function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Prisma returns NUMERIC as Decimal; the wire wants a number or null. */
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function listSets(workspaceId: string): Promise<(EvalSetRow & { questionCount: number })[]> {
  const p = await getPrismaClient();
  const rows = await p.evalSet.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { questions: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    workspaceId: r.workspaceId,
    name: r.name,
    description: r.description,
    kbScope: strArray(r.kbScope),
    createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    questionCount: r._count.questions,
  }));
}

export async function getSet(workspaceId: string, setId: string): Promise<EvalSetRow | null> {
  const p = await getPrismaClient();
  // Scoped in the WHERE, not checked after: a set id from another workspace must
  // read as absent, not as forbidden - the second answer confirms it exists.
  const r = await p.evalSet.findFirst({ where: { id: setId, workspaceId } });
  if (!r) return null;
  return {
    id: r.id, workspaceId: r.workspaceId, name: r.name, description: r.description,
    kbScope: strArray(r.kbScope), createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export async function createSet(input: {
  workspaceId: string; name: string; description?: string | null; kbScope: string[]; createdBy: string;
}): Promise<EvalSetRow> {
  const p = await getPrismaClient();
  const r = await p.evalSet.create({
    data: {
      workspaceId: input.workspaceId, name: input.name,
      description: input.description ?? null, kbScope: input.kbScope, createdBy: input.createdBy,
    },
  });
  return {
    id: r.id, workspaceId: r.workspaceId, name: r.name, description: r.description,
    kbScope: strArray(r.kbScope), createdBy: r.createdBy,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export async function listQuestions(setId: string): Promise<EvalQuestionRow[]> {
  const p = await getPrismaClient();
  const rows = await p.evalQuestion.findMany({ where: { setId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return rows.map((r) => ({
    id: r.id, setId: r.setId, question: r.question,
    expectedEvidence: strArray(r.expectedEvidence), note: r.note, position: r.position,
  }));
}

export async function addQuestion(input: {
  setId: string; question: string; expectedEvidence: string[]; note?: string | null;
}): Promise<EvalQuestionRow> {
  const p = await getPrismaClient();
  const last = await p.evalQuestion.findFirst({ where: { setId: input.setId }, orderBy: { position: "desc" } });
  const r = await p.evalQuestion.create({
    data: {
      setId: input.setId, question: input.question, expectedEvidence: input.expectedEvidence,
      note: input.note ?? null, position: (last?.position ?? -1) + 1,
    },
  });
  return {
    id: r.id, setId: r.setId, question: r.question,
    expectedEvidence: strArray(r.expectedEvidence), note: r.note, position: r.position,
  };
}

export async function deleteQuestion(setId: string, questionId: string): Promise<boolean> {
  const p = await getPrismaClient();
  const r = await p.evalQuestion.deleteMany({ where: { id: questionId, setId } });
  return r.count > 0;
}

function toRun(r: Record<string, unknown>): EvalRunRow {
  return {
    id: r.id as string,
    setId: r.setId as string,
    baselineLabel: r.baselineLabel as string,
    verificationFilter: r.verificationFilter as string,
    topK: r.topK as number,
    state: r.state as string,
    questionCount: r.questionCount as number,
    recallHitPct: num(r.recallHitPct),
    citationPrecisionPct: num(r.citationPrecisionPct),
    groundedAnswerPct: num(r.groundedAnswerPct),
    gapCount: r.gapCount as number,
    degraded: r.degraded as boolean,
    errorCode: (r.errorCode as string | null) ?? null,
    createdBy: (r.createdBy as string | null) ?? null,
    startedAt: (r.startedAt as Date).toISOString(),
    finishedAt: r.finishedAt ? (r.finishedAt as Date).toISOString() : null,
  };
}

export async function openRun(input: {
  setId: string; workspaceId: string; baselineLabel: string; verificationFilter: string; topK: number; createdBy: string;
}): Promise<EvalRunRow> {
  const p = await getPrismaClient();
  // Opened as `running` BEFORE the work, so a run that crashes leaves a trace
  // rather than vanishing. The alternative - insert on completion - makes a
  // failed run indistinguishable from one nobody started.
  return toRun(await p.evalRun.create({ data: { ...input, state: "running" } }));
}

export async function completeRun(
  runId: string,
  metrics: RunAggregate,
  outcomes: readonly QuestionOutcome[],
  degraded: boolean,
): Promise<EvalRunRow> {
  const p = await getPrismaClient();
  // Results first, then the run's state. If this is interrupted between the two,
  // the run stays `running` with results attached - visibly unfinished, which is
  // recoverable. The reverse order would produce a `completed` run with no
  // results behind its numbers, which reads as trustworthy and is not.
  await p.evalRunResult.createMany({
    data: outcomes.map((o) => ({
      runId,
      questionId: o.questionId,
      recallHit: o.recallHit,
      citedExpected: o.citedExpected,
      citedTotal: o.citedTotal,
      grounded: o.grounded,
      answerExcerpt: o.answerExcerpt,
      latencyMs: o.latencyMs,
    })),
    skipDuplicates: true,
  });
  const r = await p.evalRun.update({
    where: { id: runId },
    data: {
      state: "completed",
      questionCount: metrics.questionCount,
      recallHitPct: metrics.recallHitPct,
      citationPrecisionPct: metrics.citationPrecisionPct,
      groundedAnswerPct: metrics.groundedAnswerPct,
      gapCount: metrics.gapCount,
      degraded,
      finishedAt: new Date(),
    },
  });
  return toRun(r);
}

export async function failRun(runId: string, errorCode: string): Promise<void> {
  const p = await getPrismaClient();
  await p.evalRun.update({ where: { id: runId }, data: { state: "failed", errorCode, finishedAt: new Date() } });
}

export async function listRuns(workspaceId: string, setId?: string, limit = 20): Promise<EvalRunRow[]> {
  const p = await getPrismaClient();
  const rows = await p.evalRun.findMany({
    where: { workspaceId, ...(setId ? { setId } : {}) },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
  return rows.map((r) => toRun(r as unknown as Record<string, unknown>));
}

/** The run a new one should be compared against: the most recent COMPLETED run
 *  of the same set, excluding the one just made. A failed or still-running run
 *  is not a baseline. */
export async function previousRun(setId: string, excludeRunId: string): Promise<EvalRunRow | null> {
  const p = await getPrismaClient();
  const r = await p.evalRun.findFirst({
    where: { setId, state: "completed", id: { not: excludeRunId } },
    orderBy: { startedAt: "desc" },
  });
  return r ? toRun(r as unknown as Record<string, unknown>) : null;
}

export interface GapRow {
  questionId: string;
  question: string;
  recallHit: boolean;
  citedExpected: number;
  citedTotal: number;
  grounded: boolean;
  answerExcerpt: string | null;
}

/** Per-question detail for a run, worst first: a gap is what an operator has to
 *  look at, so it must not be buried under the questions that passed. */
export async function runResults(runId: string): Promise<GapRow[]> {
  const p = await getPrismaClient();
  const rows = await p.evalRunResult.findMany({ where: { runId }, include: { question: true } });
  return rows
    .map((r) => ({
      questionId: r.questionId,
      question: r.question.question,
      recallHit: r.recallHit,
      citedExpected: r.citedExpected,
      citedTotal: r.citedTotal,
      grounded: r.grounded,
      answerExcerpt: r.answerExcerpt,
    }))
    .sort((a, b) => {
      if (a.recallHit !== b.recallHit) return a.recallHit ? 1 : -1;
      if (a.grounded !== b.grounded) return a.grounded ? 1 : -1;
      return a.citedExpected - b.citedExpected;
    });
}
