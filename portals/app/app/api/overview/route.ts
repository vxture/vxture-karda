import { NextResponse } from "next/server";
import { requireAuth } from "../../kb/api/http";
import { prismaEnabled, getPrismaClient } from "../../lib/db";
import { DEMO_ASSETS, DEMO_TOTALS_OPS, demoAssetByName, type DemoAssetSpec } from "../../kb/demo/seed-data";
import type { OverviewAsset, OverviewData } from "../../kb/demo/overview-types";

// GET /api/overview - the 知识资产 read model.
//
// Content figures (asset list, doc/entry counts, verification coverage, stale
// counts, processing split) are LIVE database aggregates over the session's
// active workspace. Supply-ledger figures (calls, top agents, hot questions)
// have no schema yet - they come from the demo overlay in kb/demo/seed-data
// and the response says so via `demoOps: true`. When the supply ledger lands
// (channels milestone) the overlay is replaced by real aggregation and the
// flag drops; the response shape is designed to survive that swap unchanged.
export const dynamic = "force-dynamic";

interface KbAggregates {
  docTotal: number;
  docIndexed: number;
  docProcessing: number;
  docParked: number;
  docVerified: number;
  entryTotal: number;
  entryVerified: number;
  entryStale: number;
}

function specToAsset(spec: DemoAssetSpec, id: string, agg: KbAggregates | null): OverviewAsset {
  const docTotal = agg ? agg.docTotal : spec.docCount;
  const entryTotal = agg ? agg.entryTotal : spec.entryCount;
  const verified = agg ? agg.docVerified + agg.entryVerified : Math.round(((docTotal + entryTotal) * spec.verifiedPct) / 100);
  const stale = agg ? agg.entryStale : spec.staleEntries;
  const governed = docTotal + entryTotal;
  const coveragePct = governed === 0 ? 0 : Math.round((verified / governed) * 100);
  const processing = spec.processing
    ? agg
      ? { indexed: agg.docIndexed, total: docTotal, parked: agg.docParked }
      : { indexed: spec.processing.indexed, total: docTotal, parked: spec.processing.parked }
    : undefined;
  return {
    id,
    name: spec.name,
    source: spec.source,
    sourceLabel: spec.sourceLabel,
    publishState: spec.publishState,
    docCount: docTotal,
    entryCount: entryTotal,
    coveragePct,
    staleCount: stale,
    health: spec.ops.health,
    heat7d: spec.ops.heat7d,
    sparkline: spec.ops.sparkline,
    sparkTone: spec.ops.sparkTone,
    topConsumers: spec.ops.topConsumers,
    highlight: spec.ops.highlight,
    tags: spec.tags,
    processing,
    stewardSuggestions: spec.ops.stewardSuggestions,
  };
}

function totalsFor(assets: OverviewAsset[]): OverviewData["totals"] {
  const entryCount = assets.reduce((n, a) => n + a.entryCount + a.docCount, 0);
  const verifiedCount = assets.reduce(
    (n, a) => n + Math.round(((a.entryCount + a.docCount) * a.coveragePct) / 100),
    0,
  );
  return {
    assetCount: assets.length,
    entryCount,
    verifiedCount,
    coveragePct: entryCount === 0 ? 0 : Math.round((verifiedCount / entryCount) * 100),
    todayCalls: DEMO_TOTALS_OPS.todayCalls,
    directCalls: DEMO_TOTALS_OPS.directCalls,
    runosCalls: DEMO_TOTALS_OPS.runosCalls,
    deltaPct: DEMO_TOTALS_OPS.deltaPct,
    topAgents: [...DEMO_TOTALS_OPS.topAgents],
    steward: { ...DEMO_TOTALS_OPS.steward },
  };
}

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  if (!prismaEnabled()) {
    // Offline/mock mode: the whole page renders from the spec.
    const assets = DEMO_ASSETS.map((spec, i) => specToAsset(spec, `demo-${i}`, null));
    const data: OverviewData = { totals: totalsFor(assets), assets, demoOps: true };
    return NextResponse.json(data);
  }

  const p = await getPrismaClient();
  const workspaceId = auth.user.activeWorkspace;
  const kbs = await p.knowledgeBase.findMany({
    where: { workspaceId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });

  const kbIds = kbs.map((k) => k.id);
  const [docStates, docVerifs, entryVerifs] = await Promise.all([
    p.document.groupBy({ by: ["kbId", "contentState"], where: { kbId: { in: kbIds } }, _count: { _all: true } }),
    p.document.groupBy({ by: ["kbId", "verificationState"], where: { kbId: { in: kbIds } }, _count: { _all: true } }),
    p.entry.groupBy({ by: ["kbId", "verificationState"], where: { kbId: { in: kbIds } }, _count: { _all: true } }),
  ]);

  const aggByKb = new Map<string, KbAggregates>();
  const agg = (id: string): KbAggregates => {
    let a = aggByKb.get(id);
    if (!a) {
      a = { docTotal: 0, docIndexed: 0, docProcessing: 0, docParked: 0, docVerified: 0, entryTotal: 0, entryVerified: 0, entryStale: 0 };
      aggByKb.set(id, a);
    }
    return a;
  };
  for (const row of docStates) {
    const a = agg(row.kbId);
    const n = row._count._all;
    a.docTotal += n;
    if (row.contentState === "indexed") a.docIndexed += n;
    else if (row.contentState === "processing") a.docProcessing += n;
    else if (row.contentState === "draft") a.docParked += n;
  }
  for (const row of docVerifs) {
    if (row.verificationState === "verified") agg(row.kbId).docVerified += row._count._all;
  }
  for (const row of entryVerifs) {
    const a = agg(row.kbId);
    a.entryTotal += row._count._all;
    if (row.verificationState === "verified") a.entryVerified += row._count._all;
    if (row.verificationState === "stale") a.entryStale += row._count._all;
  }

  const assets: OverviewAsset[] = kbs.map((kb) => {
    const spec = demoAssetByName(kb.name);
    const a = aggByKb.get(kb.id) ?? null;
    if (spec) return specToAsset(spec, kb.id, a);
    // An asset outside the demo set (user-created): real content figures,
    // neutral ops defaults.
    const docTotal = a?.docTotal ?? 0;
    const entryTotal = a?.entryTotal ?? 0;
    const verified = (a?.docVerified ?? 0) + (a?.entryVerified ?? 0);
    const governed = docTotal + entryTotal;
    return {
      id: kb.id,
      name: kb.name,
      source: kb.ownerType === "user" ? "agent" : "platform",
      sourceLabel: kb.ownerType === "user" ? "自建" : "平台共建",
      publishState: kb.publishState as OverviewAsset["publishState"],
      docCount: docTotal,
      entryCount: entryTotal,
      coveragePct: governed === 0 ? 0 : Math.round((verified / governed) * 100),
      staleCount: a?.entryStale ?? 0,
      health: "healthy",
      heat7d: 0,
      sparkline: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      sparkTone: "primary",
      topConsumers: [],
      highlight: { kind: "steward", text: "尚无运营数据", strong: "", action: undefined },
      tags: [],
      stewardSuggestions: 0,
    };
  });

  const data: OverviewData = { totals: totalsFor(assets), assets, demoOps: true };
  return NextResponse.json(data);
}
