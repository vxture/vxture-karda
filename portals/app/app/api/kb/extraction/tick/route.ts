import { NextResponse } from "next/server";
import { runExtractionPass, PASS_LIMIT } from "../../../../kb/assertions/extract-pass";

// POST /api/kb/extraction/tick: run one bounded extraction sweep.
//
// Separate from /api/kb/processing/tick, which is the point of KD-211: the two
// passes have different invalidation keys and different cadences. Processing is
// interactive - someone uploaded something and is waiting. Extraction is bulk
// and nobody waits, so it gets its own schedule and its own bounded pass, and a
// slow extraction can never delay an upload.
//
// Gated by INTERNAL_JOB_TOKEN (an internal scheduler on the tailnet, never a
// user session) and fail-closed, the same posture as the processing tick, the
// usage flush and the governance sweep.
//
// Parked work resumes by DEFAULT rather than behind a `resume` flag, unlike the
// processing tick. The difference is what parked means for each: a processing
// task parks on quota, which is exceptional. Every extraction task parks today,
// on the missing `karda.extract` grant (vxture-atlas#39) - so a sweep that
// skipped parked work by default would do nothing at all until someone
// remembered a flag, on the very day the grant landed.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");
  if (!expected || got !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }

  const body: unknown = await req.json().catch(() => null);
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const rawLimit = typeof o.limit === "number" ? o.limit : PASS_LIMIT;
  const limit = Math.max(1, Math.min(PASS_LIMIT, Math.floor(rawLimit)));

  const result = await runExtractionPass({
    limit,
    resume: o.resume === false ? false : true,
  });
  return NextResponse.json(result);
}
