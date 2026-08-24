// High-quality demo/seed dataset for the 知识资产 milestone (owner,
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
// The dataset follows the approved V2 design, extended 2026-08-24 (owner:
// "增加测试样例数据" for the five-per-row grid): twelve assets across the four
// source kinds (agent-built / platform-built / arda-sync / external-authority)
// and all three publish states, with two attention cases (stale
// re-verification), two coverage-gap cases and one still-processing import.

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
    // owner_sub is set only for owner_type='user' (chk_kb_owner_sub,
    // 210-data-model.md#L71); the arda provenance lives in source/sourceLabel.
    ownerSub: null,
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
  {
    name: "现场处置卡",
    description: "一线班组的口袋处置卡与断路卡",
    ownerType: "user",
    ownerSub: null, // filled from the seeding session's sub
    publishState: "private",
    source: "agent",
    sourceLabel: "自建 · forge",
    tags: ["处置卡", "应急预案"],
    docCount: 12,
    entryCount: 96,
    verifiedPct: 90,
    staleEntries: 0,
    docTitleStems: [
      "燃气泄漏先期处置卡",
      "有限空间作业断路卡",
      "高处坠落急救处置卡",
      "触电事故先期处置卡",
    ],
    entryTitleStems: [
      "先期处置的三步动作",
      "警戒范围的快速划定",
      "报告口径与联络清单",
      "个体防护的最低配置",
      "移交现场的确认要点",
      "常见误操作与纠正",
    ],
    ops: {
      health: "healthy",
      heat7d: 87,
      sparkline: [30, 42, 38, 55, 47, 60, 52, 68, 74],
      sparkTone: "ai",
      topConsumers: ["forge"],
      highlight: {
        kind: "agent_usage",
        text: "forge 今日引用",
        strong: "23 次",
        action: "集中在夜班交接前后",
      },
      stewardSuggestions: 0,
    },
  },
  {
    name: "培训与考核题库",
    description: "岗位培训课件与持证考核题库",
    ownerType: "platform",
    ownerSub: null,
    publishState: "org_published",
    source: "platform",
    sourceLabel: "平台共建",
    tags: ["培训", "考核"],
    docCount: 128,
    entryCount: 864,
    verifiedPct: 95,
    staleEntries: 0,
    docTitleStems: [
      "特种作业安全培训课件",
      "应急救援员职业技能教材",
      "消防设施操作员培训手册",
      "无人机驾驶员理论课件",
      "危化品安全管理培训教材",
      "高压电工作业培训课件",
    ],
    entryTitleStems: [
      "判断题:动火作业审批时限",
      "单选题:四色安全风险等级",
      "多选题:受限空间进入条件",
      "案例题:泄漏事故的处置顺序",
      "简答题:应急演练评估要素",
      "实操题:正压式呼吸器佩戴",
    ],
    ops: {
      health: "healthy",
      heat7d: 156,
      sparkline: [40, 35, 50, 45, 62, 55, 70, 66, 78],
      sparkTone: "primary",
      topConsumers: ["scribe"],
      highlight: {
        kind: "hot_question",
        text: "今日最热一问:",
        strong: "“受限空间作业的进入许可条件?”",
        action: "被引 14 次",
      },
      stewardSuggestions: 0,
    },
  },
  {
    name: "会议纪要与决议",
    description: "调度例会、专题会纪要与决议追踪",
    ownerType: "user",
    ownerSub: null, // filled from the seeding session's sub
    publishState: "ws_published",
    source: "agent",
    sourceLabel: "自建 · scribe",
    tags: ["会议", "决议"],
    docCount: 74,
    entryCount: 213,
    verifiedPct: 58,
    staleEntries: 9,
    docTitleStems: [
      "周调度例会纪要",
      "防汛专题会议纪要",
      "设备更新专题会纪要",
      "安全生产委员会纪要",
      "项目复盘会议纪要",
      "跨部门协调会纪要",
    ],
    entryTitleStems: [
      "决议事项与责任人",
      "逾期未办结事项清单",
      "上会材料的口径要求",
      "议题背景与前情摘要",
      "跟踪台账的更新规则",
      "会签流程与时限",
    ],
    ops: {
      health: "attention",
      heat7d: 64,
      sparkline: [55, 48, 60, 44, 50, 38, 42, 30, 34],
      sparkTone: "warning",
      topConsumers: ["scribe"],
      highlight: {
        kind: "reverify",
        text: "9 条决议待复验,",
        strong: "其中 2 条已过办结时限",
        action: "派发复验",
      },
      stewardSuggestions: 2,
    },
  },
  {
    name: "舆情与事件通报",
    description: "行业事故通报与舆情摘编(受控接入)",
    ownerType: "platform",
    ownerSub: null,
    publishState: "ws_published",
    source: "external",
    sourceLabel: "外部权威",
    tags: ["通报", "权威源"],
    docCount: 58,
    entryCount: 142,
    verifiedPct: 76,
    staleEntries: 0,
    docTitleStems: [
      "全国安全生产事故周通报",
      "重点行业隐患整治通报",
      "极端天气灾害情况通报",
      "同业重大事故调查报告摘编",
      "监管约谈与处罚情况通报",
    ],
    entryTitleStems: [
      "事故直接原因与责任认定",
      "同类隐患的自查对照项",
      "通报要求的整改时限",
      "涉事环节的工艺要点",
      "对本组织的适用性研判",
    ],
    ops: {
      health: "healthy",
      heat7d: 45,
      sparkline: [20, 26, 22, 35, 30, 40, 36, 44, 48],
      sparkTone: "primary",
      topConsumers: ["anlan"],
      highlight: {
        kind: "agent_usage",
        text: "anlan 今日引用",
        strong: "11 次",
        action: "多为隐患自查对照",
      },
      stewardSuggestions: 1,
    },
  },
  {
    name: "供应商与备件目录",
    description: "合格供应商名录与备件库存目录(arda 每日同步)",
    ownerType: "product",
    // owner_sub is set only for owner_type='user' (chk_kb_owner_sub); the arda
    // provenance lives in source/sourceLabel.
    ownerSub: null,
    publishState: "ws_published",
    source: "sync",
    sourceLabel: "业务同步 · arda",
    tags: ["供应链", "备件"],
    docCount: 41,
    entryCount: 327,
    verifiedPct: 66,
    staleEntries: 0,
    docTitleStems: [
      "合格供应商年度评审名录",
      "关键备件安全库存清单",
      "框架采购协议目录",
      "备件替代料对照表",
      "供应商准入审核档案",
    ],
    entryTitleStems: [
      "备件号与适配机型对照",
      "供应商交期与履约评级",
      "紧急采购的审批通道",
      "备件保质期与存储条件",
      "替代料的验证状态",
      "价格协议的有效期",
    ],
    ops: {
      health: "gap",
      heat7d: 18,
      sparkline: [22, 18, 24, 16, 20, 14, 18, 12, 15],
      sparkTone: "primary",
      topConsumers: [],
      highlight: {
        kind: "gap",
        text: "覆盖缺口:",
        strong: "“泵阀类备件的替代料验证状态”查不到",
        action: "补充知识",
      },
      stewardSuggestions: 1,
    },
  },
  {
    name: "巡检问答沉淀",
    description: "raven 巡检问答的回流萃取与人工确认沉淀",
    ownerType: "user",
    ownerSub: null, // filled from the seeding session's sub
    publishState: "org_published",
    source: "agent",
    sourceLabel: "自建 · anlan",
    tags: ["巡检问答", "回流"],
    docCount: 0,
    entryCount: 168,
    verifiedPct: 73,
    staleEntries: 0,
    docTitleStems: [],
    entryTitleStems: [
      "泵房异响的排查顺序",
      "液位计读数漂移的常见原因",
      "巡检漏项的高发点位",
      "冬季管线防冻的巡查要点",
      "阀门盘根渗漏的判定标准",
      "在线监测与人工巡检的口径差异",
      "隐患上报的拍照取证要求",
      "巡检路线临时变更的审批",
    ],
    ops: {
      health: "healthy",
      heat7d: 231,
      sparkline: [25, 34, 30, 48, 42, 58, 66, 60, 82],
      sparkTone: "ai",
      topConsumers: ["raven", "anlan"],
      highlight: {
        kind: "steward",
        text: "管家:",
        strong: "本周回流萃取 14 条,已确认 9 条",
        action: "查看待确认",
      },
      stewardSuggestions: 3,
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
