import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { prismaEnabled } from "../../lib/db";
import { readSupply } from "../../kb/tools/supply-read";
import { DEMO_CHANNELS } from "../../kb/demo/channels-demo";
import type { ChannelsData } from "../../kb/demo/channels-types";

// GET /api/channels - the 供给通道 read model.
//
// TRAFFIC is live off karda_kb.supply_call (240-ops-read-models), written at the
// one seam both channels pass through (kb/tools/supply-ledger.ts). Until that
// ledger existed this whole page was demo constants.
//
// REGISTRY is NOT live and should not be: channel names, endpoints, serving
// state, the capability contract and the activation checklist are configuration
// and a liaison state. No amount of traffic tells you whether Runos has
// registered our endpoint - a channel serving zero calls because it is
// unregistered looks identical to one nobody happens to be calling. So the two
// groups carry separate provenance markers and the page says which is which.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!prismaEnabled()) {
    return NextResponse.json({
      ...DEMO_CHANNELS,
      sources: { traffic: "demo", registry: "demo" },
    } satisfies ChannelsData);
  }

  const t = await readSupply(auth.user.activeWorkspace);

  const data: ChannelsData = {
    ...DEMO_CHANNELS,
    totals: t.totals,
    // Registry fields (name / endpoint / state / stateLabel) keep their authored
    // values; only the measured ones are replaced.
    channels: DEMO_CHANNELS.channels.map((c) => ({
      ...c,
      todayCalls: t.byChannel[c.key].todayCalls,
      p95Ms: t.byChannel[c.key].p95Ms,
      errorRatePct: t.byChannel[c.key].errorRatePct,
      spark: t.byChannel[c.key].spark,
    })),
    capabilities: DEMO_CHANNELS.capabilities.map((c) => ({
      ...c,
      todayCalls: t.capabilityCalls[c.code] ?? 0,
    })),
    // Consumers are entirely ledger-derived - there is no authored list to merge
    // with. topAsset resolves below; an unresolvable id shows as the raw id
    // rather than an empty cell, so a stale reference is visible.
    consumers: await resolveConsumerAssets(t.consumers),
    sources: { traffic: "live", registry: "demo" },
    demoOps: false,
  };
  return NextResponse.json(data);
}

/** Turn each consumer's most-cited kb id into its display name. One query for
 *  the whole page, not one per consumer. */
async function resolveConsumerAssets(
  consumers: { code: string; via: "direct" | "runos"; calls: number; sharePct: number; topAssetKbId: string | null }[],
): Promise<ChannelsData["consumers"]> {
  const ids = [...new Set(consumers.map((c) => c.topAssetKbId).filter((x): x is string => x !== null))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { getPrismaClient } = await import("../../lib/db");
    const p = await getPrismaClient();
    const rows = await p.knowledgeBase.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    for (const r of rows) names.set(r.id, r.name);
  }
  return consumers.map((c) => ({
    code: c.code,
    via: c.via,
    calls: c.calls,
    sharePct: c.sharePct,
    topAsset: c.topAssetKbId ? (names.get(c.topAssetKbId) ?? c.topAssetKbId) : "—",
  }));
}
