// Shared response types for GET /api/shell - the ONE fetch the portal chrome
// (导航栏 cards, header badge, 值班台) makes. Dependency-free, same
// contract style as overview-types/pipeline-types.
import type { StewardProposal } from "./pipeline-types";

export interface ShellActivity {
  time: string;
  text: string;
  /** Agent code highlighted at the line start (purple), if any. */
  agent?: string;
}

// Each nav card answers the same three questions in the same order (owner
// 2026-08-24): what is the CORE figure, is it GROWING, and what is WRONG.
// The chart on the card renders the core figure; the growth and problem
// figures sit beside it. Anything a card cannot answer is simply absent -
// no card invents a metric to fill the slot.

export interface ShellData {
  overview: {
    /** Core, the pair this card exists to state: assets and the knowledge in
     *  them. Verification coverage deliberately does NOT live here - it is the
     *  验证评测 card's whole subject and would only be said twice. */
    assetCount: number;
    entryCount: number;
    /** Growth: entries added over the last 7 days. */
    weeklyNew: number;
    /** Problem: assets whose health is not clean (需关注 / 有缺口). */
    needsAttention: number;
  };
  channels: {
    /** Chart: the supply split - direct S2S vs the Runos capability plane. */
    directCalls: number;
    runosCalls: number;
    /** Core + growth: today's calls and the day-over-day move. */
    todayCalls: number;
    deltaPct: number;
    /** Problem: channels serving degraded (or not serving at all). */
    degraded: number;
  };
  pipeline: {
    /** Chart + core: the work mix, three columns. */
    inflight: number;
    pending: number;
    failedResident: number;
    /** Growth: documents finished today. */
    docsToday: number;
    rebuilding: number;
  };
  evaluation: {
    /** Chart: the verified / stale / unverified split of the corpus. */
    verified: number;
    stale: number;
    unverified: number;
    coveragePct: number;
    /** Problem: coverage gaps the evaluation sets surfaced. */
    gaps: number;
  };
  /** Steward dock payload. */
  steward: {
    pending: number;
    proposals: StewardProposal[];
    /** One-line alert with the steward's judgment, null when quiet. */
    alert: { text: string; href: string } | null;
    activity: ShellActivity[];
  };
  demoOps: boolean;
}
