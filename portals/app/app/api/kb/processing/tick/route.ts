import { NextResponse } from "next/server";
import { dispatchProcessing } from "../../../../kb/processing/dispatch";

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

  // `{"resume": true}` is the parked-fleet lever (TD-004): wake suspended tasks
  // (quota returned / A1 now configured) and re-enqueue every `processing`
  // document the in-memory queue may have lost to a restart. Enqueue dedups by
  // key, so this is safe to send on every scheduled tick.
  const body: unknown = await req.json().catch(() => null);
  const resume = Boolean(body && typeof body === "object" && (body as Record<string, unknown>).resume === true);
  return NextResponse.json(await dispatchProcessing(resume));
}
