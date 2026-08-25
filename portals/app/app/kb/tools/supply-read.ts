import { getPrismaClient } from "../../lib/db";
import type { ChannelsData, ChannelKey } from "../demo/channels-types";

// The 供给通道 read model (240-ops-read-models section 4.3/4.4), reading the
// ledger supply-ledger.ts writes.
//
// Aggregation happens IN PROCESS over a bounded window, not in SQL. At today's
// volume (~1.2k calls/day, so ~2.4k rows in the 48h window) that is a few
// milliseconds and it keeps the whole computation a pure function that tests can
// drive without a database. 240 section 6 already fixes the threshold at which
// this has to become a SQL rollup instead - 50M rows, or a 7-day aggregate over
// 200ms P95 - so this is a documented stage, not an oversight.
//
// WINDOW_HOURS covers today AND yesterday because deltaPct compares the two. The
// row cap is a safety rail, not a business rule: if it ever trips, the figures
// understate rather than the request hanging, and `capped` says so in the
// payload rather than letting a silent truncation read as a quiet day.

const WINDOW_HOURS = 48;
const ROW_CAP = 50_000;

export interface SupplyRow {
  channel: string;
  capability: string;
  operation: string;
  consumerCode: string | null;
  outcome: string;
  latencyMs: number | null;
  createdAt: Date;
  assets: { kbId: string; citedCount: number }[];
}

export interface SupplyTally {
  totals: ChannelsData["totals"];
  byChannel: Record<ChannelKey, { todayCalls: number; p95Ms: number; errorRatePct: number; spark: number[] }>;
  capabilityCalls: Record<string, number>;
  consumers: { code: string; via: ChannelKey; calls: number; sharePct: number; topAssetKbId: string | null }[];
  /** True when the row cap trimmed the window - the figures understate. */
  capped: boolean;
}

const CHANNELS: ChannelKey[] = ["direct", "runos"];

/** P95 by nearest-rank. Returns 0 for an empty sample rather than NaN - a
 *  channel that served nothing has no latency, and NaN would render as a blank
 *  where a reader expects a number. */
export function p95(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(0.95 * sorted.length);
  return Math.round(sorted[Math.min(rank, sorted.length) - 1]);
}

/** Normalised 0-100 series for a sparkline. All-zero input stays all-zero
 *  instead of dividing by zero. */
export function normalise(counts: number[]): number[] {
  const max = Math.max(...counts, 0);
  if (max === 0) return counts.map(() => 0);
  return counts.map((c) => Math.round((c / max) * 100));
}

/** Hour buckets for the last `hours` hours, oldest first. */
function hourBuckets(rows: SupplyRow[], now: number, hours: number): number[] {
  const buckets = new Array<number>(hours).fill(0);
  for (const r of rows) {
    const ageH = Math.floor((now - r.createdAt.getTime()) / 3_600_000);
    if (ageH < 0 || ageH >= hours) continue;
    buckets[hours - 1 - ageH] += 1;
  }
  return buckets;
}

/**
 * Pure aggregation. `now` is injected so the day boundaries are deterministic in
 * tests - a read model that reports "today" must not be untestable because it
 * asks the clock itself.
 *
 * "Today" is the trailing 24h, not midnight-to-now: the page is an operations
 * view, and a midnight boundary makes the 00:05 reading look like an outage.
 */
export function tallySupply(rows: SupplyRow[], now: number, capped = false): SupplyTally {
  const dayMs = 86_400_000;
  const today = rows.filter((r) => now - r.createdAt.getTime() < dayMs);
  const yesterday = rows.filter((r) => {
    const age = now - r.createdAt.getTime();
    return age >= dayMs && age < 2 * dayMs;
  });

  const byChannel = {} as SupplyTally["byChannel"];
  for (const key of CHANNELS) {
    const mine = today.filter((r) => r.channel === key);
    const errors = mine.filter((r) => r.outcome === "error").length;
    byChannel[key] = {
      todayCalls: mine.length,
      p95Ms: p95(mine.map((r) => r.latencyMs ?? 0)),
      // One decimal: a 0.4% error rate rounded to 0% reads as "healthy" when it
      // is the number an operator is watching.
      errorRatePct: mine.length === 0 ? 0 : Math.round((errors / mine.length) * 1000) / 10,
      spark: normalise(hourBuckets(mine, now, 24)),
    };
  }

  const capabilityCalls: Record<string, number> = {};
  for (const r of today) capabilityCalls[r.capability] = (capabilityCalls[r.capability] ?? 0) + 1;

  // Consumers, with the library each cited most. `via` is the channel that
  // consumer used most today - an agent reaching us both ways is possible but
  // not the norm, and the page shows one badge.
  const byConsumer = new Map<string, { calls: number; viaCount: Record<string, number>; kb: Map<string, number> }>();
  for (const r of today) {
    const code = r.consumerCode;
    if (!code) continue; // a human in Console is not a consumer agent
    let c = byConsumer.get(code);
    if (!c) {
      c = { calls: 0, viaCount: {}, kb: new Map() };
      byConsumer.set(code, c);
    }
    c.calls += 1;
    c.viaCount[r.channel] = (c.viaCount[r.channel] ?? 0) + 1;
    for (const a of r.assets) c.kb.set(a.kbId, (c.kb.get(a.kbId) ?? 0) + a.citedCount);
  }
  const totalConsumerCalls = [...byConsumer.values()].reduce((n, c) => n + c.calls, 0);
  const consumers = [...byConsumer.entries()]
    .map(([code, c]) => {
      const topKb = [...c.kb.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0];
      const via = (c.viaCount.runos ?? 0) > (c.viaCount.direct ?? 0) ? "runos" : "direct";
      return {
        code,
        via: via as ChannelKey,
        calls: c.calls,
        sharePct: totalConsumerCalls === 0 ? 0 : Math.round((c.calls / totalConsumerCalls) * 100),
        topAssetKbId: topKb ? topKb[0] : null,
      };
    })
    // Code-unit tie-break, never localeCompare: consumer codes are ASCII today
    // but the ordering must not depend on the runtime's collation either way.
    .sort((a, b) => b.calls - a.calls || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));

  const todayCalls = today.length;
  const yCalls = yesterday.length;
  return {
    totals: {
      todayCalls,
      directCalls: byChannel.direct.todayCalls,
      runosCalls: byChannel.runos.todayCalls,
      // No yesterday to compare against is NOT "+100%" - it is "no comparison",
      // which reads as 0 rather than a fake surge on a product's first day.
      deltaPct: yCalls === 0 ? 0 : Math.round(((todayCalls - yCalls) / yCalls) * 100),
      p95Ms: p95(today.map((r) => r.latencyMs ?? 0)),
    },
    byChannel,
    capabilityCalls,
    consumers,
    capped,
  };
}

/** Read the window out of the ledger. Caller must have checked prismaEnabled(). */
export async function readSupply(workspaceId: string, now: number = Date.now()): Promise<SupplyTally> {
  const p = await getPrismaClient();
  const since = new Date(now - WINDOW_HOURS * 3_600_000);
  const rows = await p.supplyCall.findMany({
    where: { workspaceId, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP + 1,
    select: {
      channel: true,
      capability: true,
      operation: true,
      consumerCode: true,
      outcome: true,
      latencyMs: true,
      createdAt: true,
      assets: { select: { kbId: true, citedCount: true } },
    },
  });
  const capped = rows.length > ROW_CAP;
  return tallySupply(capped ? rows.slice(0, ROW_CAP) : rows, now, capped);
}
