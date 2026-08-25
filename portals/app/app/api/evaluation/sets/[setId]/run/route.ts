import { NextResponse } from "next/server";
import { prismaEnabled, getPrismaClient } from "../../../../../lib/db";
import { getSet, listQuestions, openRun, completeRun, failRun, previousRun } from "../../../../../kb/evaluation/store";
import { runEvaluation, type RetrievalPort } from "../../../../../kb/evaluation/runner";
import { compareRuns, hasRegression } from "../../../../../kb/evaluation/scoring";
import { consoleSearch, consoleAsk } from "../../../../../kb/retrieval/console-retrieval";
import { getVisibleSetResolver } from "../../../../../kb/retrieval/visible-set";
import { getRecallCorpus, getRecallTextResolver } from "../../../../../kb/retrieval/corpus";
import { getKbStore } from "../../../../../kb/lib/store";
import { getGenerationClient, askModelSelection } from "../../../../../kb/retrieval/generation";
import { requireAuth, readJson } from "../../../../../kb/api/http";
import { verificationFilterOf, topKOf } from "../../../../../kb/retrieval/params";

// POST /api/evaluation/sets/:setId/run   run a set and record the measurement
//
// THE RUN USES THE SAME RETRIEVAL CHAIN AN AGENT USES - consoleSearch /
// consoleAsk, the session-facing twins of the tool face. That is the whole
// validity claim: a runner with its own recall path measures the runner.
//
// Synchronous on purpose. A set is tens of questions, not thousands, and a run
// that returns its own before/after is worth waiting for; a background job would
// need a polling surface to say the same thing later. If sets grow past what a
// request can carry, THAT is when this becomes a queued task - not before.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Map recall-unit ids back to the level expected evidence is authored at.
 *
 * A recall unit is either a CHUNK (belonging to a document) or an ENTRY (which
 * is itself the unit). So a chunk id resolves to its document id, and anything
 * that is not a chunk is passed through as itself - that is the entry case, not
 * a failure. Doing this here rather than in the scoring keeps the scoring rules
 * free of storage concerns.
 */
async function toDocumentIds(unitIds: readonly string[]): Promise<string[]> {
  if (unitIds.length === 0) return [];
  const p = await getPrismaClient();
  const chunks = await p.chunk.findMany({
    where: { id: { in: [...unitIds] } },
    select: { id: true, documentId: true },
  });
  const byChunk = new Map(chunks.map((c) => [c.id, c.documentId]));
  // Order is preserved: recall order is rank order, and precision counts the
  // citation LIST, so re-ordering or de-duplicating here would change the score.
  return unitIds.map((id) => byChunk.get(id) ?? id);
}

export async function POST(req: Request, ctx: { params: Promise<{ setId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { setId } = await ctx.params;

  if (!prismaEnabled()) {
    // No tables, no measurement. Refusing beats returning a plausible number.
    return NextResponse.json({ error: "no_database" }, { status: 503 });
  }

  const set = await getSet(auth.user.activeWorkspace, setId);
  if (!set) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = await readJson(req);
  const baselineLabel = typeof body.baseline_label === "string" && body.baseline_label.trim()
    ? body.baseline_label.trim()
    : "unlabelled";
  const verificationFilter = verificationFilterOf(body.verification_filter);
  const topK = topKOf(body.top_k);

  const questions = await listQuestions(setId);
  const caller = { org: auth.user.activeOrg, ws: auth.user.activeWorkspace, user: auth.user.sub };
  const generation = getGenerationClient();
  const deps = {
    visibleSet: getVisibleSetResolver(getKbStore()),
    corpus: getRecallCorpus(),
    texts: getRecallTextResolver(),
    generation,
    ...askModelSelection(),
  };
  // An empty scope means "everything visible" downstream, which is the same rule
  // the 检验台 uses - a set that names no libraries evaluates the whole corpus.
  const kbIds = set.kbScope.length > 0 ? set.kbScope : undefined;

  const retrieval: RetrievalPort = {
    async search(question) {
      const r = await consoleSearch(caller, { query: question, kb_ids: kbIds, top_k: topK, verification_filter: verificationFilter }, deps);
      return { docIds: await toDocumentIds(r.items.map((i) => i.id)), degraded: r.degraded !== null };
    },
    async ask(question) {
      const r = await consoleAsk(caller, { question, kb_ids: kbIds, top_k: topK, verification_filter: verificationFilter }, deps);
      // `notConfigured` -> null, NOT an empty citation list. "Answering is off"
      // and "answered but cited nothing" must not produce the same metric; the
      // first has no grounded-answer rate to report at all.
      if ("notConfigured" in r) return null;
      return {
        docIds: await toDocumentIds(r.citations.map((c) => c.id)),
        excerpt: r.answer.slice(0, 500),
        degraded: r.degraded !== null,
      };
    },
  };

  const run = await openRun({
    setId, workspaceId: auth.user.activeWorkspace, baselineLabel, verificationFilter, topK, createdBy: auth.user.sub,
  });

  try {
    const result = await runEvaluation(questions, retrieval);
    // The comparison target is read BEFORE this run is completed, so it can
    // never compare against itself.
    const previous = await previousRun(setId, run.id);
    const completed = await completeRun(run.id, result.metrics, result.outcomes, result.degraded);
    const deltas = compareRuns(result.metrics, previous);

    return NextResponse.json({
      run: completed,
      previous,
      deltas,
      regression: hasRegression(deltas),
      answeringAvailable: result.answeringAvailable,
      skipped: result.skipped,
    });
  } catch (e) {
    // A crashed run stays visible as `failed` rather than vanishing - a run
    // nobody can see failed looks like a run nobody started.
    await failRun(run.id, e instanceof Error ? e.name.slice(0, 64) : "run_failed");
    return NextResponse.json({ error: "run_failed" }, { status: 500 });
  }
}
