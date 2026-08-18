import { NextResponse } from "next/server";
import { prismaEnabled } from "../../../../lib/db";
import { seedPresets } from "../../../../kb/lib/seed";

// POST /api/kb/admin/seed-presets: apply the factory-preset templates (six
// processing + three content presets, KD-002) into karda_kb. This closes
// TD-006's open invocation-point choice with the "explicit and gated" option:
// an internal-token endpoint an operator (or the deploy runbook) hits once per
// environment - matching how other privileged runtime acts ship (tick, sweep,
// usage flush), with none of the startup-hook drawbacks (no per-boot write, no
// replica thundering herd).
//
// Idempotent by construction (INSERT-only, ON CONFLICT DO NOTHING), so re-runs
// are safe and report zero inserts. Fail-closed on the token, like tick.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.INTERNAL_JOB_TOKEN;
  const got = req.headers.get("x-internal-job-token");
  if (!expected || got !== expected) {
    return new NextResponse("forbidden", { status: 403 });
  }
  if (!prismaEnabled()) {
    // Offline/mock mode has the presets in memory already (template-resolver);
    // there is no database to seed.
    return NextResponse.json({ error: "no_database", detail: "DATABASE_URL is not configured" }, { status: 503 });
  }
  const result = await seedPresets();
  return NextResponse.json({ seeded: result });
}
