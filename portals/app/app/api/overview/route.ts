import { NextResponse } from "next/server";
import { readAssetHeat, readSupply, hasSupplyTraffic, type AssetHeat } from "../../kb/tools/supply-read";
import { readWorkspaceKarda } from "../../kb/assertions/workspace-read";
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
    agentSuggestions: spec.ops.agentSuggestions,
  };
}

/** 演示 agent 块 -> 真实口径的形状。离线态没有确认台,演示值按原样映射。 */
function demoAgentTotals(): OverviewData["totals"]["agent"] {
  const d = DEMO_TOTALS_OPS.agent;
  return { pending: d.pending, conflicts: d.conflicts, admitted: d.admitted, refluxDrafts: d.refluxDrafts };
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
    agent: demoAgentTotals(),
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

  // Per-library citation heat off the supply ledger (240 section 4.4). It counts
  // CITED, not recalled, so a library that gets pulled into every recall pool but
  // is never believed stays cold - which is the figure an owner actually needs.
  // A library with no citations yet gets no entry, and reads as 0 below rather
  // than inheriting the demo overlay's numbers.
  const heat = await readAssetHeat(workspaceId);
  // 卡尔达块自确认台(KD-222)起有真值:待确认 / 冲突组 / 已收录 / 回流草稿全部
  // 来自 workspace-read,不再是演示口径。供给侧数字(调用、热点)仍是演示——
  // demoOps 说的是它们。
  const karda = await readWorkspaceKarda(workspaceId);
  // 供给总数的接线开关:账本有过真流量就全面转真(含真实的零);一条都没有过则整套
  // 演示叙事一起保留——半真半假的页面自己打自己。/api/channels 早已走同一账本,
  // 这里不接,总览和通道页就会互相矛盾。
  const live = await hasSupplyTraffic(workspaceId);
  const supply = live ? await readSupply(workspaceId) : null;
  const NO_HEAT: AssetHeat = { heat7d: 0, sparkline: [0, 0, 0, 0, 0, 0, 0], topConsumers: [] };

  const assets: OverviewAsset[] = kbs.map((kb) => {
    const spec = demoAssetByName(kb.name);
    const a = aggByKb.get(kb.id) ?? null;
    const h = heat.get(kb.id);
    // A seeded demo library keeps its authored ops story ONLY until it has real
    // traffic; once the ledger has anything to say about it, the ledger wins.
    if (spec) {
      const base = specToAsset(spec, kb.id, a);
      return h ? { ...base, heat7d: h.heat7d, sparkline: h.sparkline, topConsumers: h.topConsumers } : base;
    }
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
      // No label: the live path knows only the KIND, and `source` already
      // carries it. Composing a Chinese word here put prose on the wire.
      sourceLabel: null,
      publishState: kb.publishState as OverviewAsset["publishState"],
      docCount: docTotal,
      entryCount: entryTotal,
      coveragePct: governed === 0 ? 0 : Math.round((verified / governed) * 100),
      staleCount: a?.entryStale ?? 0,
      health: "healthy",
      heat7d: (h ?? NO_HEAT).heat7d,
      sparkline: (h ?? NO_HEAT).sparkline,
      sparkTone: "primary",
      topConsumers: (h ?? NO_HEAT).topConsumers,
      // The live path has a FIGURE, not a sentence. `text: null` tells the card
      // to say it in the reader's language from `kind` + `heat7d`.
      highlight: h
        ? { kind: "agent_usage", text: null, strong: "", action: undefined }
        : { kind: "agent", text: null, strong: "", action: undefined },
      tags: [],
      agentSuggestions: 0,
    };
  });

  const totals = {
    ...totalsFor(assets),
    ...(supply
      ? {
          todayCalls: supply.totals.todayCalls,
          directCalls: supply.totals.directCalls,
          runosCalls: supply.totals.runosCalls,
          deltaPct: supply.totals.deltaPct,
          topAgents: supply.consumers.slice(0, 3).map((c) => ({ code: c.code, calls: c.calls })),
        }
      : {}),
    agent: {
      pending: karda.pending,
      conflicts: karda.conflictGroups,
      admitted: karda.admitted,
      refluxDrafts: karda.refluxDrafts,
    },
  };
  // demoOps 只指供给叙事(demoNote 那行脚注说的就是它);转真即撤。
  const data: OverviewData = { totals, assets, demoOps: !live };
  return NextResponse.json(data);
}
