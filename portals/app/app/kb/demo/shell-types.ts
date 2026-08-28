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
    /**
     * 知识**落在哪些资产上** —— 按条目数降序的前几个,外加一条把长尾并起来的
     * 「其余」。
     *
     * 加这一份是因为这张卡有**两个维度**(知识、资产),而只给两个总数等于只画了
     * 一个:12 和 3,852 摆在一起,看不出这 3,852 是均匀铺在 12 个库里,还是有一个
     * 库装了九成。一根条 = 一个资产(资产维度),条长 = 它装着多少知识(知识维度),
     * 两维用同一张图说完。
     *
     * `rest` 是长尾的合并项,`restCount` 是它合并了几个;没有长尾时 `restCount` 为 0。
     */
    topAssets: { name: string; entries: number }[];
    rest: number;
    restCount: number;
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
