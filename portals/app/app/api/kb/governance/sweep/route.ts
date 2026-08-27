import { NextResponse } from "next/server";
import { GovernanceService } from "../../../../kb/governance/service";
import { getContentStore } from "../../../../kb/lib/content-store";
import { getKbStore } from "../../../../kb/lib/store";
import { prismaEnabled, getPrismaClient } from "../../../../lib/db";
import { requireAuth } from "../../../../kb/api/http";
import { sweepUngrounded } from "../../../../kb/assertions/store";

// POST /api/kb/governance/sweep: the interval-expiry sweep (Track 12). Moves
// `verified` items whose re-verification interval has lapsed to `stale`, so the
// default quality tier stops recalling them. Idempotent and drainable: a second
// call finds nothing new.
//
// TWO CALLERS, TWO SCOPES - and the scope is the whole reason they are not the
// same code path:
//
//   · CRON, with INTERNAL_JOB_TOKEN. Sweeps GLOBALLY, which is right for a job
//     running as the system. Fail-closed on the token, like the usage flush.
//   · A SIGNED-IN USER, from 验证评测. Sweeps ONLY the caller's workspace. This
//     is not a nicety: an unscoped user-triggered sweep means one tenant
//     pressing a button scans and re-states every other tenant's corpus.
//
// Batch 11 added the second. Without it the sweep was reachable only by a
// machine credential, so a governance owner watching stale items pile up had no
// way to make the state catch up with the clock - the same shape of gap as the
// document retry in batch 10.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const gov = new GovernanceService(getContentStore(), getKbStore());
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");

  // The machine path first: a valid job token means the caller IS the system,
  // and the global scan is intended.
  if (expected && got === expected) {
    // Two sweeps, one schedule, kept as separate calls on purpose. They share a
    // cadence and an operator, NOT a rule: one enforces the re-verification
    // interval, the other enforces "an assertion with no grounds must go"
    // (KD-206 / 140 section 7). Fusing them would mean a change to verification
    // policy could break assertion recall.
    const staleSweep = await gov.sweep(new Date());
    const ungrounded = prismaEnabled() ? await sweepUngrounded("all") : { scanned: 0, tombstoned: 0 };
    return NextResponse.json({ ...staleSweep, ungrounded, scope: "global" });
  }
  // A WRONG token is a failed machine call, not an invitation to fall through to
  // the session path - answer it as the machine path would.
  if (got !== null) return new NextResponse("forbidden", { status: 403 });

  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!prismaEnabled()) {
    return NextResponse.json({
      scanned: 0,
      staled: 0,
      ungrounded: { scanned: 0, tombstoned: 0 },
      scope: "workspace",
      live: false,
    });
  }

  const p = await getPrismaClient();
  const kbs = await p.knowledgeBase.findMany({
    where: { workspaceId: auth.user.activeWorkspace, deletedAt: null },
    select: { id: true },
  });
  // `kbs.map` may be empty, and that is passed through deliberately: an empty
  // scope must sweep NOTHING. Collapsing it to "no filter" would turn a
  // workspace with no libraries into a global sweep.
  const scope = kbs.map((k) => k.id);
  const summary = await gov.sweep(new Date(), 200, scope);
  // The SAME scope array, not "all". A workspace with no libraries sweeps
  // nothing - see the comment above and `SweepScope`, where "everything" has to
  // be written out.
  const ungrounded = await sweepUngrounded(scope);
  return NextResponse.json({ ...summary, ungrounded, scope: "workspace", live: true });
}
