// Demo overlay for the 加工管道 page (design canvas V2 · Steward board). The
// pipeline has no schema yet - every figure here is the demo supply-ledger
// voice, flagged `demoOps: true` by the API exactly like the overview's ops
// overlay. Steward figures DERIVE from DEMO_TOTALS_OPS so 知识资产 and 加工管道
// can never disagree about 预验/冲突/回流/待确认.
import { DEMO_TOTALS_OPS } from "./seed-data";
import type { PipelineData, RebuildData, TaskDetail, TasksData } from "./pipeline-types";

const S = DEMO_TOTALS_OPS.steward;

export const DEMO_PIPELINE: PipelineData = {
  docsToday: 62,
  p95Seconds: 38,
  autoRatePct: 94,
  report: [
    { key: "parsed", value: "62", unit: "docs" },
    { key: "units", value: "1,180", unit: "entries" },
    { key: "merged", value: "86", unit: "groups" },
    { key: "conflicts", value: String(S.conflicts), unit: "occurrences", tone: "warning" },
    { key: "preVerified", value: String(S.preVerified), unit: "entries", tone: "success" },
    { key: "reflux", value: String(S.refluxDrafts), unit: "entries", tone: "ai" },
  ],
  stages: [
    {
      key: "understand",
      value: "62",
    },
    {
      key: "extract",
      value: "1,180",
    },
    {
      key: "weave",
      value: "86",
      aside: { kind: "conflicts", n: S.conflicts },
      asideTone: "warning",
      active: true,
    },
    {
      key: "verify",
      value: String(S.preVerified),
      aside: { kind: "pending", n: S.pending },
      asideTone: "muted",
    },
    {
      key: "commit",
      value: "1,102",
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
      body: "3 处条目引用了已废止的章节编号,卡尔达已定位替换目标章节。",
      strong: "应用修订后引用链保持完整。",
      secondaryAction: "逐条查看",
      primaryAction: "应用修订",
    },
  ],
  pendingTotal: S.pending,
  demoOps: true,
};

// 任务与队列 (design canvas: PipelineQueue board). Figures echo the queue
// board's sample voice; dots are fetch/parse/chunk/embed/commit.
export const DEMO_TASKS: TasksData = {
  counts: { inflight: 12, suspended: 4, failed: 6 },
  throughput: { docsToday: 62, p95Seconds: 38, freshnessP95Min: 6.4, docsPerMin: 4.2 },
  queueDepth: { interactive: 3, sync: 21, bulk: 240 },
  failures: { transient: 4, permanent: 6, quota: 4, unavailable: 3 },
  stageP95: [1.2, 21, 0.8, 9.0, 0.6],
  tiers: [
    { key: "interactive", queued: 3, concurrency: "2 并发", pct: 12 },
    { key: "sync", queued: 21, concurrency: "2 并发", pct: 34 },
    { key: "bulk", queued: 240, concurrency: "2 并发", pct: 78 },
  ],
  orgConcurrency: "org 并发 6/8",
  sources: { tasks: "demo", ops: "demo" },
  alert: {
    kbName: "行业标准与法规",
    rate: "31% > 30%",
    body: "近 24h 失败 5/16——集中在扫描件。",
    judgment: "模板选错的概率最大,建议扫描类切换 deep path 偏好或改用 paper 模板。",
  },
  tasks: [
    {
      id: "T-8842",
      title: "GB 51427-2026 自动消防设施通用技术要求.pdf",
      detail: "行业标准与法规 · 深度解析 · legal 模板 · 交互队列",
      dots: ["done", "active", "todo", "todo", "todo"],
      status: { kind: "running", stage: "parse", detail: "62% · 版面" },
      statusTone: "primary",
    },
    {
      id: "T-8845",
      title: "forge 沉淀:市政项目投标问答摘录(12 条)",
      detail: "投标知识库 · runos · karda.kb-write · 落为草稿 → 卡尔达萃取 → 预验",
      dots: ["done", "done", "ai", "todo", "todo"],
      status: { kind: "running", stage: "chunk", detail: "卡尔达萃取中" },
      statusTone: "ai",
      agentDeposit: true,
    },
    {
      id: "T-8839",
      title: "华东区重点客户档案(arda 增量 · 3 份变更)",
      detail: "客户与项目档案 · hash 判据 delta · 同步队列",
      dots: ["done", "done", "done", "active", "todo"],
      status: { kind: "running", stage: "embed", detail: "批 32" },
      statusTone: "primary",
    },
    {
      id: "T-8836",
      title: "巡检无人机作业手册 v4.docx",
      detail: "设备作业手册 · manual 模板 · 父子分块 214",
      dots: ["done", "done", "done", "done", "active"],
      status: { kind: "running", stage: "commit", detail: "v3→v4" },
      statusTone: "primary",
    },
    {
      id: "T-8831",
      title: "应急救援员职业技能教材(全 4 册).pdf",
      detail: "培训与考核题库 · 加工配额尽 · 恢复自动续跑",
      dots: ["done", "done", "done", "warn", "todo"],
      status: { kind: "suspendedQuota" },
      statusTone: "warning",
    },
    {
      id: "T-8802",
      title: "扫描版-老旧法规汇编 1998.pdf",
      detail: "行业标准与法规 · 永久失败 · 版面无法还原(损坏页 41-58)",
      dots: ["done", "fail", "todo", "todo", "todo"],
      status: { kind: "failed", stage: "parse", detail: "修正后重试" },
      statusTone: "danger",
    },
    {
      id: "T-8828",
      title: "城市综合管廊运行维护技术标准.pdf",
      detail: "行业标准与法规 · Atlas 429 退避 · 第 2/5 次 · 断点续跑自向量化",
      dots: ["done", "done", "done", "todo", "todo"],
      status: { kind: "retrying", attempt: 2, detail: "42s" },
      statusTone: "muted",
    },
  ],
  demoOps: true,
};

// 任务详情 (design canvas: PipelineDoc board). One rich demo task; the API
// serves it for any id until the pipeline schema lands.
export const DEMO_TASK_DETAIL: TaskDetail = {
  id: "T-8842",
  title: "GB 51427-2026 自动消防设施通用技术要求.pdf",
  meta: ["行业标准与法规", "14.2 MB", "上传 · Console", "交互队列"],
  badge: "PROCESSING · PARSING",
  stages: [
    {
      kicker: "01 FETCH",
      label: "取回",
      state: "done",
      timing: "1.2s · 10:41:03",
      desc: "原始件已持久化——重跑任何阶段不再重新下载。",
      chips: [{ label: "raw · 14.2 MB", tone: "muted" }],
    },
    {
      kicker: "02 PARSE",
      label: "解析 · 深度路径",
      state: "active",
      timing: "已运行 21.4s",
      progressPct: 62,
      desc: "版面分析 → 块类型识别 → 内容提取 → 结构树。视觉与 OCR 模型经 Atlas 调用(批量 · 同域亲和)。",
      chips: [
        { label: "版面 ✓ 214 页", tone: "muted" },
        { label: "表格 TSR · 19/31", tone: "primary" },
        { label: "公式 LaTeX · 待", tone: "dim" },
        { label: "卡尔达语义修复 · 2 处", tone: "ai" },
      ],
    },
    {
      kicker: "03 CHUNK",
      label: "分块 · legal 条款式",
      state: "todo",
      desc: "条/款/项为天然块边界,保留条号;法规名 + 条号前缀增强。只消费 IR——调参重跑从本阶段起,免深度解析成本。",
    },
    {
      kicker: "04 EMBED",
      label: "向量化",
      state: "todo",
      desc: "批量经 Atlas,库级锁定 bge-m3@v2;429 退避,配额尽转挂起(恢复自动续跑)。全文索引同批构建。",
    },
    {
      kicker: "05 COMMIT",
      label: "入藏 · 原子替换",
      state: "todo",
      desc: "新分块集合整版本写入,提交指针原子切换 v2 → v3——检索永不见半更新态;旧版本异步清理。",
    },
  ],
  config: [
    ["加工模板", "legal · 条款式"],
    ["解析路径", "深度(扫描/复杂版面)"],
    ["目标块长 / 上限", "512 / 1024 tok"],
    ["重叠", "0(结构感知)"],
    ["上下文增强", "法规名 + 条号前缀"],
  ],
  configNote: "文档级覆盖:本文档模板可异于库默认(general)。",
  lineage: [
    ["content_hash", "sha256:9f2c…b71e"],
    ["config_fingerprint", "legal@1 · 512/1024/0"],
    ["IR 版本", "parser v3(构建中)"],
    ["索引版本", "v2 在线 → v3 待提交"],
  ],
  lineageNote: "同 (doc, hash, config) 任务自动去重;hash 未变直接跳过(伪变更免疫)。",
  cost: [
    ["解析模型调用", "233 次(版面/OCR/TSR)"],
    ["embedding", "待 · 预估 96k tok"],
    ["铸币姿态", "service · 归属方付费"],
  ],
  demoOps: true,
};

// 受控重建 (design canvas: PipelineRebuild board).
export const DEMO_REBUILD: RebuildData = {
  active: {
    kbName: "行业标准与法规",
    trigger: "embedding 模型 bge-m3 v2 → v3(平台排程 · 模型下线迁移,分批执行)",
    servingNote: "在线检索 · 旧索引 v7 服务中",
    stepIndex: 1,
    progressPct: 68,
    progressLabel: "214 / 312 docs · 68%",
    facts: ["IR 复用 96% · 跳过解析", "预计完成 14 min", "仅 embedding 成本"],
  },
  switched: {
    kbName: "设备作业手册",
    changeNote: "manual 模板参数调整(块长 512 → 768)· 已切换至 v12,旧索引 v11 保留中",
    windowLeft: "19h 24m",
    windowPct: 81,
    rollbackTo: "回退到 v11",
  },
  instantiation: {
    title: "应急预案 · 平台包 v3 实例化",
    flowNote: "快照复制 → 复用平台侧 IR(免重解析)→ 按本组织 embedding 配置重建向量 → 原子提交为 T 级库",
    estimate: "186 docs · 预估 8 min",
    costNote: "成本主项:embedding",
  },
  triggers: [
    "embedding 模型版本变更(库级锁定,升级即重建)",
    "加工模板或参数变更(复用 IR,只重跑分块之后)",
    "解析器大版本升级(按 IR 版本圈定范围)",
    "silo 迁移 / 平台强制(模型下线,平台分批排程)",
  ],
  constraints: [
    ["构建期在线检索", "旧索引不间断"],
    ["失败处置", "影子废弃 · 旧索引无损"],
    ["回退窗口", "24h(KD-008)"],
    ["org 同时重建上限", "2 库(KD-008)"],
    ["队列", "bulk · 不挤占交互"],
  ],
  stewardAdvice:
    "v3 模型在本库抽样召回评测提升 +7.2%;切换后建议保留回退窗口满 24h,并在验证评测页跑一轮基线对比。",
  demoOps: true,
};
