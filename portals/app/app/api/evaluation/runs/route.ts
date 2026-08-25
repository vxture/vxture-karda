import { NextResponse } from "next/server";
import { prismaEnabled } from "../../../lib/db";
import { listRuns, runResults } from "../../../kb/evaluation/store";
import { compareRuns, hasRegression } from "../../../kb/evaluation/scoring";
import { requireAuth } from "../../../kb/api/http";

// GET /api/evaluation/runs[?set=<id>][&run=<id>]
//
// The run history, and with `run` the per-question detail behind one of them.
// History is the whole point of storing runs: a single number says nothing, and
// "did this change help" is a question about two.
//
// Each run carries its delta against the PREVIOUS completed run of the same set,
// computed here rather than in the page - the "unknown, not flat" rule (a
// measured run compared against an unmeasured one) is a correctness rule, and a
// second implementation in a component would drift from it.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!prismaEnabled()) return NextResponse.json({ runs: [], live: false });

  const url = new URL(req.url);
  const setId = url.searchParams.get("set") ?? undefined;
  const runId = url.searchParams.get("run");

  const runs = await listRuns(auth.user.activeWorkspace, setId);

  // Chronological neighbours WITHIN a set - a run is only comparable to another
  // run of the same questions.
  const withDeltas = runs.map((run, i) => {
    const prior = runs.slice(i + 1).find((r) => r.setId === run.setId && r.state === "completed") ?? null;
    const deltas = compareRuns(run, prior);
    return { run, previousRunId: prior?.id ?? null, deltas, regression: hasRegression(deltas) };
  });

  if (!runId) return NextResponse.json({ runs: withDeltas, live: true });

  const found = runs.find((r) => r.id === runId);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({
    runs: withDeltas,
    live: true,
    detail: { runId, results: await runResults(runId) },
  });
}
