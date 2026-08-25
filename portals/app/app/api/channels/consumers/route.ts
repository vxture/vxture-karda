import { NextResponse } from "next/server";
import { prismaEnabled } from "../../../lib/db";
import { readConsumers } from "../../../kb/tools/consumer-read";
import { requireAuth } from "../../../kb/api/http";

// GET /api/channels/consumers   per-consumer drill-down over the supply ledger
//
// 供给通道 could already say "error rate 31%". It could not say WHO was failing,
// at which operation, or with what error code - so the figure named a problem
// and then stopped. This is the drill-down behind it.
//
// Same 48h window and the same rows the channel dashboard tallies, so the two
// surfaces cannot disagree about a consumer's call count.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!prismaEnabled()) {
    // No ledger offline. An empty report rather than a demo one: a fabricated
    // consumer with a fabricated error rate is exactly the figure someone would
    // act on.
    return NextResponse.json({ consumers: [], diagnosis: [], windowHours: 48, capped: false, live: false });
  }
  return NextResponse.json({ ...(await readConsumers(auth.user.activeWorkspace)), live: true });
}
