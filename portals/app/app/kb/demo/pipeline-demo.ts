// Demo overlay for the 加工管道 page (design canvas V2 · Steward board). The
// pipeline has no schema yet - every figure here is the demo supply-ledger
// voice, flagged `demoOps: true` by the API exactly like the overview's ops
// overlay. Steward figures DERIVE from DEMO_TOTALS_OPS so 资产总览 and 加工管道
// can never disagree about 预验/冲突/回流/待确认.
import { DEMO_TOTALS_OPS } from "./seed-data";
import type { PipelineData } from "./pipeline-types";

const S = DEMO_TOTALS_OPS.steward;

export const DEMO_PIPELINE: PipelineData = {
  docsToday: 62,
  p95Seconds: 38,
  autoRatePct: 94,
  report: [
    { label: "理解 · 解析文档", value: "62 份" },
    { label: "萃取 · 知识单元", value: "1,180 条" },
    { label: "编织 · 去重合并", value: "86 组" },
    { label: "发现冲突", value: `${S.conflicts} 处`, tone: "warning" },
    { label: "自动预验通过", value: `${S.preVerified} 条`, tone: "success" },
    { label: "回流萃取", value: `${S.refluxDrafts} 条`, tone: "ai" },
  ],
  stages: [
    {
      key: "understand",
      kicker: "01 UNDERSTAND",
      label: "理解",
      desc: "语义解析 · 表格与图纸多模态",
      value: "62",
      unit: "份",
    },
    {
      key: "extract",
      kicker: "02 EXTRACT",
      label: "萃取",
      desc: "提炼可引用的知识单元",
      value: "1,180",
      unit: "条",
    },
    {
      key: "weave",
      kicker: "03 WEAVE",
      label: "编织",
      desc: "关联 · 去重 · 冲突检测",
      value: "86",
      unit: "组",
      aside: `冲突 ${S.conflicts}`,
      asideTone: "warning",
      active: true,
    },
    {
      key: "verify",
      kicker: "04 VERIFY",
      label: "验证",
      desc: "AI 预验 · 人只做确认",
      value: String(S.preVerified),
      unit: "条",
      aside: `待确认 ${S.pending}`,
      asideTone: "muted",
    },
    {
      key: "commit",
      kicker: "05 COMMIT",
      label: "入藏",
      desc: "可检索 · 进入供给",
      value: "1,102",
      unit: "条",
    },
  ],
  proposals: [
    {
      id: "p-conflict-1",
      kind: "conflict",
      title: "冲突裁决",
      tag: "CONFLICT",
      body: "《作业手册 2026》与《作业手册 2023》对小雨条件单架次时长表述不一致(25 分钟 / 40 分钟)。",
      strong: "建议采信 2026 版,旧条目标记废止并保留追溯。",
      secondaryAction: "查看依据",
      primaryAction: "采纳",
    },
    {
      id: "p-preverify-1",
      kind: "preverify",
      title: "批量预验确认",
      tag: "PRE-VERIFIED",
      body: `${S.preVerified} 条低风险知识与既有已验证条目交叉一致,AI 预验通过。`,
      strong: "建议一键批量确认为已验证。",
      secondaryAction: "抽查 5 条",
      primaryAction: "批量确认",
    },
    {
      id: "p-fix-1",
      kind: "fix",
      title: "纠错提案",
      tag: "FIX",
      body: "3 处条目引用了已废止的章节编号,管家已定位替换目标章节。",
      strong: "应用修订后引用链保持完整。",
      secondaryAction: "逐条查看",
      primaryAction: "应用修订",
    },
  ],
  pendingTotal: S.pending,
  demoOps: true,
};
