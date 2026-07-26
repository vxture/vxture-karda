import { NextResponse } from "next/server";
import { GovernanceService } from "../../../../kb/governance/service";
import { getContentStore } from "../../../../kb/lib/content-store";
import { getKbStore } from "../../../../kb/lib/store";

// POST /api/kb/governance/sweep: the interval-expiry sweep (Track 12). Moves
// `verified` items whose re-verification interval has lapsed to `stale`, so the
// default quality tier stops recalling them. Gated by INTERNAL_JOB_TOKEN - a
// cron/job caller, never a user session - and fail-closed, exactly like the usage
// flush. Idempotent and drainable: a second call finds nothing new.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");
  if (!expected || got !== expected) return new NextResponse("forbidden", { status: 403 });

  const gov = new GovernanceService(getContentStore(), getKbStore());
  const summary = await gov.sweep(new Date());
  return NextResponse.json(summary);
}
