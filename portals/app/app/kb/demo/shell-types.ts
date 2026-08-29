// Shared response types for GET /api/shell - the ONE fetch the portal chrome
// (导航栏 cards, header badge, 智枢) makes. Dependency-free, same
// contract style as overview-types/pipeline-types.
import type { AgentProposal } from "./pipeline-types";

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
    /** 累计调用,以及它的通道拆分。与今日并列的第二个宏观数——今日说「现在忙不忙」,
     *  累计说「被用了多久、多深」。
     *
     *  **拆分不是可选的**:这个域的全部意义就是「分给哪条通道」,只给总数等于把这件事
     *  盖住。两个饼并排还多说了一件事——累计与今日的构成差异就是趋势本身。 */
    totalCalls: number;
    directTotal: number;
    runosTotal: number;
    /** Problem: channels serving degraded (or not serving at all). */
    degraded: number;
    // 这里曾经有过一份 `topConsumers`(在服务谁)。撤掉了(owner 2026-08-29):它是我
    // 为了填卡片下半截的空白加的,而**为了填空加的东西,填完就该被质疑**——消费方榜
    // 在供给通道域页面上有完整的一份,卡片复述一遍只会把卡撑高。
    //
    // 首页三问的第二问「在服务谁」由此仍未在卡上作答;真要答,该答的形式是「谁」而不是
    // 「几个谁」,那需要的位置比一张卡的页脚大。留在这里作为记录,不是遗漏。
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
  /**
   * **Karda Super Agent(卡尔达)的那一份 payload** —— 智枢里显示的东西。
   *
   * 字段名保留 `agent`,这是刻意的(2026-08-29 全仓清扫时的决定):
   *
   *   · 用户可见的文案全部改成了 Karda Super Agent / 卡尔达 / Karda —— 那是**客户读的**;
   *   · 而 `agent` 作为标识符描述的是它扮演的**角色**(照管这批知识的那个),
   *     不是它的名字。角色词没有错,改它要动一条跨文件的数据契约,零用户收益。
   *
   * 留这段注释,是因为「代码说 agent、界面说卡尔达」如果没有一处说明,下一个人会
   * 以为是漏改的。**它不是漏改,是分层。** 真要统一,那是一次单独的机械改名,不该
   * 混在改界面的批次里。
   */
  agent: {
    pending: number;
    proposals: AgentProposal[];
    /** One-line alert with the agent's judgment, null when quiet. */
    alert: { text: string; href: string } | null;
    activity: ShellActivity[];
  };
  demoOps: boolean;
}
