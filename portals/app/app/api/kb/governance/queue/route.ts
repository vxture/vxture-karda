import { NextResponse } from "next/server";
import { prismaEnabled } from "../../../../lib/db";
import { readQueue, QUEUE_LIMIT } from "../../../../kb/governance/queue-read";
import { requireAuth } from "../../../../kb/api/http";

// GET /api/kb/governance/queue[?kb=<id>]   the re-verification work queue
//
// The list behind the 待复验 number. 验证评测 could already COUNT the stale set;
// until this route there was no way to get the items, so the page could only
// report a problem it could not help you fix.
//
// `kb` narrows to one library, which is what turns the 低于覆盖基线 list from a
// dead end into a way in: the worst-covered asset becomes a link to exactly its
// own outstanding work.
//
// Scoped to the caller's active workspace by readQueue itself - the population is
// the workspace's live libraries, the same one corpus-read.ts counts, so the
// queue length and the 待复验 figure on the same page cannot disagree.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!prismaEnabled()) {
    // Offline the stores are per-request, so there is no corpus to queue. An
    // empty queue is the honest answer; a demo queue with working buttons would
    // be the "looks actionable but isn't" failure this batch exists to avoid.
    return NextResponse.json({ items: [], staleTotal: 0, unverifiedTotal: 0, truncated: false, live: false });
  }

  const kb = new URL(req.url).searchParams.get("kb") || undefined;
  const result = await readQueue(auth.user.activeWorkspace, kb, QUEUE_LIMIT);
  return NextResponse.json({ ...result, live: true });
}
