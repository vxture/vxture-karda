// High-quality demo/seed dataset for the 资产总览 milestone (owner,
// 2026-08-21: "补齐测试数据,也可以当做一些高质量seed数据").
//
// Two halves, deliberately separated:
//   - CONTENT specs (docs/entries per asset) are REAL seedable rows - the
//     seed-demo endpoint writes them into karda_kb, and every count the
//     overview shows for them is then a live DB aggregate.
//   - OPS overlays (calls, top agents, hot questions) model the supply LEDGER,
//     which has no schema yet (it lands with the channels milestone). Until
//     then the overview merges these figures in and flags the response
//     `demoOps: true`, so nothing pretends to be measured that is not.
//
// The dataset follows the approved V2 design: six assets across four source
// kinds (agent-built / platform-built / arda-sync / external-authority), with
// one attention case (stale re-verification), one coverage-gap case and one
// still-processing import.

import type { AssetHealth, AssetSource, OverviewHighlight } from "./overview-types";

export interface DemoAssetSpec {
  name: string;
  description: string;
  ownerType: "platform" | "tenant" | "user" | "product";
  ownerSub: string | null;
  publishState: "private" | "ws_published" | "org_published";
  source: AssetSource;
  sourceLabel: string;
  tags: string[];
  docCount: number;
  entryCount: number;
  /** Target verified share (0-100) applied to docs and entries when seeding. */
  verifiedPct: number;
  /** Entries seeded as verification_state = "stale" (待复验). */
  staleEntries: number;
  /** Content-state split for documents; omitted = all indexed. */
  processing?: { indexed: number; processing: number; parked: number };
  docTitleStems: string[];
  entryTitleStems: string[];
  ops: {
    health: AssetHealth;
    heat7d: number;
    sparkline: number[];
    sparkTone: "primary" | "ai" | "warning";
    topConsumers: string[];
    highlight: OverviewHighlight;
    stewardSuggestions: number;
  };
}

export const DEMO_WORKSPACE_HINT = "seed-demo writes into the caller-chosen workspace (dev default: the dev-login workspace)";

export const DEMO_ASSETS: DemoAssetSpec[] = [
  {
    name: "投标知识库",
    description: "历史标书、投标结论与商务资质沉淀",
    ownerType: "user",
    ownerSub: null, // filled from the seeding session's sub
    publishState: "org_published",
    source: "agent",
    sourceLabel: "自建 · forge",
    tags: ["投标", "商务"],
    docCount: 238,
    entryCount: 247,
    verifiedPct: 84,
    staleEntries: 0,
    docTitleStems: [
      "市政管网改造项目投标文件",
      "应急指挥中心建设项目技术标",
      "智慧消防平台项目商务标",
      "园区安防一体化项目投标书",
      "防汛物资储备库建设投标文件",
      "隧道监测系统项目技术方案",
      "城市生命线监测项目投标文件",
      "综合管廊运维服务投标书",
    ],
    entryTitleStems: [
      "资质证明清单与高频缺项对照",
      "技术方案评分项拆解",
      "商务报价结构与中标区间参考",
      "同类项目业绩证明模板",
      "投标保证金办理流程",
      "联合体投标的资质分工要点",
      "售后服务承诺书标准条款",
      "废标风险清单与自查项",
    ],
    ops: {
      health: "healthy",
      heat7d: 412,
      sparkline: [20, 28, 25, 50, 40, 65, 80, 72, 90],
      sparkTone: "ai",
      topConsumers: ["forge", "anlan"],
      highlight: {
        kind: "hot_question",
        text: "今日最热一问:",
        strong: "“近三年市政项目业绩证明的格式要求?”",
        action: "被引 31 次",
      },
      stewardSuggestions: 1,
    },
  },
  {
    name: "设备作业手册",
    description: "巡检与作业设备的操作、维保手册",
    ownerType: "platform",
    ownerSub: null,
    publishState: "org_published",
    source: "platform",
    sourceLabel: "平台共建",
    tags: ["设备巡检", "作业"],
    docCount: 412,
    entryCount: 712,
    verifiedPct: 92,
    staleEntries: 0,
    docTitleStems: [
      "巡检无人机作业手册",
      "四足巡检机器人操作规程",
      "红外热成像仪使用手册",
      "应急照明车操作维保手册",
      "水下探测器作业指引",
      "高空作业平台安全操作规程",
      "移动泵车快速部署手册",
      "卫星便携站开通指引",
    ],
    entryTitleStems: [
      "雨天巡检的作业限制",
      "电池低温保养要求",
      "起飞前检查单",
      "禁飞区与净空要求速查",
      "常见故障码对照与处置",
      "维保周期与台账要求",
      "夜间作业照明配置",
      "多机协同作业间距要求",
    ],
    ops: {
      health: "healthy",
      heat7d: 128,
      sparkline: [25, 35, 25, 60, 45, 75, 60, 85, 70],
      sparkTone: "primary",
      topConsumers: ["raven"],
      highlight: {
        kind: "agent_usage",
        text: "raven 今日引用",
        strong: "46 次",
        action: "峰值在早班巡检 08:00-09:00",
      },
      stewardSuggestions: 0,
    },
  },
  {
    name: "应急预案库",
    description: "总体预案、专项预案与处置方案",
    ownerType: "platform",
    ownerSub: null,
    publishState: "ws_published",
    source: "platform",
    sourceLabel: "平台共建",
    tags: ["应急预案", "响应"],
    docCount: 186,
    entryCount: 389,
    verifiedPct: 61,
    staleEntries: 17,
    docTitleStems: [
      "生产安全事故综合应急预案",
      "防汛防台专项应急预案",
      "危化品泄漏处置方案",
      "大面积停电事件应急预案",
      "地质灾害应急处置方案",
      "森林火灾扑救预案",
      "城市内涝应急处置方案",
      "突发环境事件应急预案",
    ],
    entryTitleStems: [
      "三级响应的启动条件与流程",
      "物资调拨的审批链",
      "现场指挥部的组成与职责",
      "信息报送的时限要求",
      "应急队伍集结点与联络方式",
      "跨区域增援的请求流程",
      "响应终止与恢复评估要求",
      "演练频次与评估标准",
    ],
    ops: {
      health: "attention",
      heat7d: 96,
      sparkline: [70, 62, 75, 55, 60, 42, 48, 32, 35],
      sparkTone: "warning",
      topConsumers: ["raven"],
      highlight: {
        kind: "reverify",
        text: "17 条待复验,",
        strong: "其中 3 条本周被引用过",
        action: "派发复验",
      },
      stewardSuggestions: 2,
    },
  },
  {
    name: "平台产品资料",
    description: "产品手册、参数表与解决方案资料",
    ownerType: "platform",
    ownerSub: null,
    publishState: "org_published",
    source: "platform",
    sourceLabel: "平台共建",
    tags: ["产品", "共享"],
    docCount: 154,
    entryCount: 508,
    verifiedPct: 88,
    staleEntries: 0,
    docTitleStems: [
      "巡检机器人 R2 产品手册",
      "应急指挥平台白皮书",
      "物联感知网关技术规格书",
      "融合通信终端产品资料",
      "无人机机巢部署方案",
      "视频智能分析盒参数表",
      "北斗定位终端产品手册",
      "应急单兵装备解决方案",
    ],
    entryTitleStems: [
      "防护等级与续航参数",
      "典型部署拓扑与选型建议",
      "与第三方平台的对接接口",
      "常见异业竞品参数对照",
      "报价折扣权限与审批",
      "交付周期与实施里程碑",
      "售后 SLA 与备件策略",
      "版本路线图要点",
    ],
    ops: {
      health: "healthy",
      heat7d: 203,
      sparkline: [30, 38, 30, 55, 48, 70, 58, 82, 75],
      sparkTone: "ai",
      topConsumers: ["scribe", "anlan"],
      highlight: {
        kind: "hot_question",
        text: "今日最热一问:",
        strong: "“巡检机器人 R2 的防护等级与续航?”",
        action: "被引 19 次",
      },
      stewardSuggestions: 0,
    },
  },
  {
    name: "客户与项目档案",
    description: "客户主数据与项目交付纪要(arda 每日同步)",
    ownerType: "product",
    ownerSub: "arda",
    publishState: "ws_published",
    source: "sync",
    sourceLabel: "业务同步 · arda",
    tags: ["客户", "项目"],
    docCount: 67,
    entryCount: 186,
    verifiedPct: 71,
    staleEntries: 0,
    docTitleStems: [
      "华东区重点客户档案",
      "华南区项目交付纪要",
      "西南区框架协议客户清单",
      "重点行业客户拜访纪要",
      "项目验收报告归档",
      "客户满意度回访记录",
    ],
    entryTitleStems: [
      "客户组织架构与关键联系人",
      "历史项目清单与合同额",
      "付款习惯与信用评估",
      "竞争格局与在位供应商",
      "验收流程的客户侧要求",
      "续约窗口与商机提示",
    ],
    ops: {
      health: "gap",
      heat7d: 12,
      sparkline: [18, 15, 20, 12, 16, 10, 14, 8, 12],
      sparkTone: "primary",
      topConsumers: [],
      highlight: {
        kind: "gap",
        text: "覆盖缺口:",
        strong: "“华东区去年验收纪要”等 2 类问题查不到",
        action: "补充知识",
      },
      stewardSuggestions: 1,
    },
  },
  {
    name: "行业标准与法规",
    description: "适用的国标、行标与法规原文(受控接入)",
    ownerType: "platform",
    ownerSub: null,
    publishState: "private",
    source: "external",
    sourceLabel: "外部权威",
    tags: ["法规标准", "权威源"],
    docCount: 94,
    entryCount: 0,
    verifiedPct: 100,
    staleEntries: 0,
    processing: { indexed: 62, processing: 28, parked: 4 },
    docTitleStems: [
      "GB 51427 自动消防设施通用技术要求",
      "生产安全事故应急预案管理办法",
      "JT/T 1440 公路应急抢通装备配置规范",
      "GB/T 38315 社会单位灭火和应急疏散预案",
      "应急管理部门执法工作规范",
      "城市综合管廊运行维护技术标准",
    ],
    entryTitleStems: [],
    ops: {
      health: "processing",
      heat7d: 0,
      sparkline: [0, 0, 0, 0, 0, 0, 0, 0, 0],
      sparkTone: "primary",
      topConsumers: [],
      highlight: {
        kind: "steward",
        text: "管家:",
        strong: "GB 51427 新版已比对出 12 处差异",
        action: "入藏后自动生成更新提案",
      },
      stewardSuggestions: 1,
    },
  },
];

// Supply-ledger overlay for the totals strip. Consistent by construction:
// today = direct + runos; top-agent calls sum below today (the remainder is
// long-tail); reflux drafts match the steward feed.
export const DEMO_TOTALS_OPS = {
  todayCalls: 1204,
  directCalls: 812,
  runosCalls: 392,
  deltaPct: 22,
  topAgents: [
    { code: "forge", calls: 486 },
    { code: "scribe", calls: 326 },
    { code: "anlan", calls: 231 },
  ],
  steward: { preVerified: 41, conflicts: 3, refluxDrafts: 27, pending: 5 },
} as const;

/** Deterministic title for the i-th seeded row of a stem list. */
export function demoTitle(stems: string[], index: number): string {
  const stem = stems[index % stems.length];
  const serial = Math.floor(index / stems.length) + 1;
  return serial === 1 ? stem : `${stem}(${serial})`;
}

export function demoAssetByName(name: string): DemoAssetSpec | undefined {
  return DEMO_ASSETS.find((a) => a.name === name);
}
