import { NextResponse } from "next/server";
import { drain } from "../../../../kb/processing/worker";
import { getProcessingRuntime } from "../../../../kb/processing/runtime";

// POST /api/kb/processing/tick: drain claimable processing tasks in one bounded
// pass. Gated by INTERNAL_JOB_TOKEN (an internal scheduler / cron on the tailnet,
// never a user session) - the same posture as /api/usage/flush. Fail-closed: an
// unset or mismatched token is refused.
//
// A single bounded pass on purpose: scheduling and concurrency stay the queue's
// job, not a hidden loop's (worker.drain stops when only parked / backed-off
// tasks remain). The caller re-invokes on a schedule to keep draining.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");
  if (!expected || got !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }
  const ran = await drain(getProcessingRuntime());
  return NextResponse.json({ ran });
}
