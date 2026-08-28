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
    /** 累计调用。与今日并列的第二个宏观数——今日说「现在忙不忙」,累计说「被用了
     *  多久、多深」。只给今日的话,刚上线的系统和跑了半年的在卡片上长得一样。 */
    totalCalls: number;
    /** Problem: channels serving degraded (or not serving at all). */
    degraded: number;
    /**
     * **在服务谁** —— 按调用量排的前几个消费方。
     *
     * 这正是首页三问里的第二问(150 §2.4),而这张卡此前只回答了「有多少调用、走哪条
     * 通道」——量和通道都不是「谁」。加这一份之后,这个域的卡片才真的答完它那一问。
     *
     * 只给 code 和 calls:更细的(走哪条通道、常读哪个库)在域页面上,卡片不复述。
     */
    topConsumers: { code: string; calls: number }[];
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
