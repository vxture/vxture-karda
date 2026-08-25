import type { Catalog, MessageFn } from "../catalog";

// 加工管道: the steward board, the task queue, one task's detail, and controlled
// rebuild.
//
// WHAT IS HERE AND WHAT IS NOT. These four screens are still a design canvas
// over `kb/demo/pipeline-demo.ts` - the pipeline has no schema yet - and most of
// what they render is per-run demo content: a task's status ("解析中 62% · 版面"),
// a stage chip ("表格 TSR · 19/31"), a cost row. Those carry live figures, are
// not a fixed vocabulary, and are not translated. In `en-US` these pages will
// therefore still read largely Chinese until the pipeline has real data - that
// is the content showing through, not a half-done sweep.
//
// What IS here is the vocabulary that does not change per run: the five steward
// stages, the daily report rows, the three queue tiers, the rebuild steps. Those
// were authored beside the data as `label` / `desc` / `unit` fields, which made
// them a second copy of a fixed list - the same shape as the channel dashboard's
// `stateLabel`. They now come from the enum plus this file.
export const pipeline = {
  // --- the five steward stages ------------------------------------------------
  stageUnderstand: { "zh-CN": "理解", "en-US": "Understand" },
  stageUnderstandDesc: {
    "zh-CN": "语义解析 · 表格与图纸多模态",
    "en-US": "Semantic parsing · tables and drawings, multimodal",
  },
  unitDocs: { "zh-CN": "份", "en-US": "docs" },
  stageExtract: { "zh-CN": "萃取", "en-US": "Extract" },
  stageExtractDesc: { "zh-CN": "提炼可引用的知识单元", "en-US": "Distil citable knowledge units" },
  unitEntries: { "zh-CN": "条", "en-US": "units" },
  stageWeave: { "zh-CN": "编织", "en-US": "Weave" },
  stageWeaveDesc: { "zh-CN": "关联 · 去重 · 冲突检测", "en-US": "Link · deduplicate · detect conflicts" },
  unitGroups: { "zh-CN": "组", "en-US": "groups" },
  unitOccurrences: { "zh-CN": "处", "en-US": "found" },
  stageVerify: { "zh-CN": "验证", "en-US": "Verify" },
  stageVerifyDesc: { "zh-CN": "AI 预验 · 人只做确认", "en-US": "AI pre-verifies · a person only confirms" },
  stageCommit: { "zh-CN": "入藏", "en-US": "Commit" },
  stageCommitDesc: { "zh-CN": "可检索 · 进入供给", "en-US": "Retrievable · enters supply" },

  // --- 今日战报 rows -----------------------------------------------------------
  reportParsed: { "zh-CN": "理解 · 解析文档", "en-US": "Understand · documents parsed" },
  reportUnits: { "zh-CN": "萃取 · 知识单元", "en-US": "Extract · knowledge units" },
  reportMerged: { "zh-CN": "编织 · 去重合并", "en-US": "Weave · merged duplicates" },
  reportConflicts: { "zh-CN": "发现冲突", "en-US": "Conflicts" },
  reportPreVerified: { "zh-CN": "自动预验通过", "en-US": "Auto pre-verified" },
  reportReflux: { "zh-CN": "回流萃取", "en-US": "Reflux drafts" },

  // Figures rendered beside a stage's headline number. The WORD is vocabulary,
  // the number is per-run, so they arrive separately.
  asideConflicts: {
    "zh-CN": (n: number) => `冲突 ${n}`,
    "en-US": (n: number) => `${n} conflicts`,
  } satisfies MessageFn<[number]>,
  asidePending: {
    "zh-CN": (n: number) => `待确认 ${n}`,
    "en-US": (n: number) => `${n} to confirm`,
  } satisfies MessageFn<[number]>,

  // --- steward board -----------------------------------------------------------
  errLoad: {
    "zh-CN": "加载加工管道失败，请稍后重试。",
    "en-US": "Could not load the processing pipeline. Please retry shortly.",
  },
  loading: { "zh-CN": "正在加载加工管道…", "en-US": "Loading the processing pipeline…" },
  needSignInDesc: {
    "zh-CN": "登录后查看知识管家的加工流水与待确认事项。",
    "en-US": "Sign in to see the steward's processing flow and what is awaiting your call.",
  },
  boardMeta: {
    "zh-CN": (docs: number, p95: number, auto: number) => `今日 ${docs} docs · P95 ${p95}s/doc · 自动处理 ${auto}%`,
    "en-US": (docs: number, p95: number, auto: number) => `${docs} docs today · P95 ${p95}s/doc · ${auto}% automatic`,
  } satisfies MessageFn<[number, number, number]>,
  batchConfirm: { "zh-CN": "批量确认预验", "en-US": "Confirm pre-verified in bulk" },
  stewardName: { "zh-CN": "知识管家", "en-US": "Knowledge steward" },
  stewardOnDuty: { "zh-CN": "AI AGENT · 在岗", "en-US": "AI AGENT · ON DUTY" },
  stewardBlurb: {
    "zh-CN": "负责理解、萃取、编织、验证与纠错的全程加工；需要裁决的事项才会来找你。",
    "en-US":
      "It runs the whole pass - understand, extract, weave, verify, correct - and comes to you only when something needs deciding.",
  },
  flowTitle: { "zh-CN": "加工流水 · 全程 AI 驱动", "en-US": "Processing flow · AI end to end" },
  demoNote: {
    "zh-CN": "演示口径 · 管线里程碑建设中",
    "en-US": "Illustrative figures · the pipeline milestone is being built",
  },
  pendingTitle: {
    "zh-CN": (n: number) => `待你确认 · ${n} 项`,
    "en-US": (n: number) => `Awaiting your call · ${n}`,
  } satisfies MessageFn<[number]>,
  pendingHint: {
    "zh-CN": "管家已给出建议与依据，采纳即生效",
    "en-US": "The steward has proposed an action and its grounds; accepting applies it",
  },
  restLink: {
    "zh-CN": (n: number) => `查看其余 ${n} 项 →`,
    "en-US": (n: number) => `See the other ${n} →`,
  } satisfies MessageFn<[number]>,

  // --- tasks & queue -----------------------------------------------------------
  errLoadTasks: {
    "zh-CN": "加载任务队列失败，请稍后重试。",
    "en-US": "Could not load the task queue. Please retry shortly.",
  },
  loadingTasks: { "zh-CN": "正在加载任务队列…", "en-US": "Loading the task queue…" },
  tasksDesc: {
    "zh-CN": "离线加工 · 三级队列 · 文档级原子替换",
    "en-US": "Offline processing · three queue tiers · atomic swap per document",
  },
  tasksMeta: {
    "zh-CN": (fresh: number, rate: number) => `新鲜度 P95 ${fresh} min · 吞吐 ${rate} docs/min`,
    "en-US": (fresh: number, rate: number) => `Freshness P95 ${fresh} min · throughput ${rate} docs/min`,
  } satisfies MessageFn<[number, number]>,
  // The five stage dots. Chinese abbreviates each to ONE character so five fit
  // across a tile; English cannot, so it uses three-letter forms. A shared
  // template could not have produced both.
  dotFetch: { "zh-CN": "取", "en-US": "fch" },
  dotParse: { "zh-CN": "析", "en-US": "prs" },
  dotChunk: { "zh-CN": "块", "en-US": "chk" },
  dotEmbed: { "zh-CN": "向", "en-US": "emb" },
  dotCommit: { "zh-CN": "藏", "en-US": "cmt" },
  tileThroughput: { "zh-CN": "今日吞吐", "en-US": "THROUGHPUT TODAY" },
  tileThroughputNote: {
    "zh-CN": (p95: number) => `docs · 端到端 P95 ${p95}s`,
    "en-US": (p95: number) => `docs · end-to-end P95 ${p95}s`,
  } satisfies MessageFn<[number]>,
  tileQueueDepth: { "zh-CN": "队列深度", "en-US": "QUEUE DEPTH" },
  tierInteractive: { "zh-CN": "交互", "en-US": "interactive" },
  tierSync: { "zh-CN": "同步", "en-US": "sync" },
  tierBulk: { "zh-CN": "批量", "en-US": "bulk" },
  tileFailures: { "zh-CN": "失败与挂起", "en-US": "FAILED & SUSPENDED" },
  failedResident: { "zh-CN": "失败驻留", "en-US": "failed, resident" },
  quotaSuspended: { "zh-CN": "配额挂起", "en-US": "quota-suspended" },
  tileStageP95: { "zh-CN": "阶段 P95 · 秒", "en-US": "STAGE P95 · SECONDS" },
  countInflight: {
    "zh-CN": (n: number) => `在制 ${n}`,
    "en-US": (n: number) => `${n} in flight`,
  } satisfies MessageFn<[number]>,
  countSuspended: {
    "zh-CN": (n: number) => `配额挂起 ${n}`,
    "en-US": (n: number) => `${n} quota-suspended`,
  } satisfies MessageFn<[number]>,
  countFailed: {
    "zh-CN": (n: number) => `失败驻留 ${n}`,
    "en-US": (n: number) => `${n} failed`,
  } satisfies MessageFn<[number]>,
  orderNote: {
    "zh-CN": "按进入时间 · 幂等键去重",
    "en-US": "By arrival time · deduplicated on the idempotency key",
  },
  tiersTitle: { "zh-CN": "三级队列 · 并发", "en-US": "Three queue tiers · concurrency" },
  tierQueued: {
    "zh-CN": (n: number, concurrency: string) => `${n} 排队 · ${concurrency}`,
    "en-US": (n: number, concurrency: string) => `${n} queued · ${concurrency}`,
  } satisfies MessageFn<[number, string]>,
  tierInteractiveScope: { "zh-CN": "上传 / Entry / Agent 沉淀", "en-US": "uploads / entries / agent deposits" },
  tierSyncScope: { "zh-CN": "Arda 增量", "en-US": "Arda increments" },
  tierBulkScope: { "zh-CN": "重建 / 实例化", "en-US": "rebuilds / instantiation" },
  backpressureNote: {
    "zh-CN": "bulk 永不饿死 interactive；sync 深度超阈值时对 Arda 通道自然背压（notify-then-pull 放缓）。",
    "en-US":
      "bulk never starves interactive; once sync depth passes its threshold the Arda channel back-pressures naturally (notify-then-pull slows down).",
  },
  failureAlertTitle: { "zh-CN": "库级失败率告警", "en-US": "Library failure-rate alert" },
  stewardVerdict: { "zh-CN": "管家判断：", "en-US": "Steward's read: " },
  viewFailures: { "zh-CN": "查看失败件", "en-US": "See the failures" },
  adjustTemplate: { "zh-CN": "调整模板", "en-US": "Adjust the template" },
  alertBody: {
    "zh-CN": (kb: string, body: string) => `「${kb}」${body}`,
    "en-US": (kb: string, body: string) => `"${kb}" ${body}`,
  } satisfies MessageFn<[string, string]>,

  failureBreakdown: { "zh-CN": "失败分类 · 24H", "en-US": "FAILURE BREAKDOWN · 24H" },
  failTransient: { "zh-CN": "瞬态（退避重试中）", "en-US": "Transient (backing off, retrying)" },
  failPermanent: { "zh-CN": "永久（驻留待修正）", "en-US": "Permanent (resident, awaiting a fix)" },
  failQuota: { "zh-CN": "配额（恢复自动续）", "en-US": "Quota (resumes on its own)" },
  poisonPill: {
    "zh-CN": "毒丸隔离：单文档失败不阻塞同库其他文档。",
    "en-US": "Poison-pill isolation: one document failing never blocks the others in its library.",
  },
  provTasksLive: { "zh-CN": "任务与队列为实时数据", "en-US": "Tasks and queues are live data" },
  provTasksDemo: { "zh-CN": "任务与队列为演示口径", "en-US": "Tasks and queues are illustrative" },
  provTasksRegistry: {
    "zh-CN": " · 新鲜度、并发上限与管家判断为登记/演示口径",
    "en-US": " · freshness, concurrency caps and the steward's read are registry or illustrative figures",
  },

  // --- controlled rebuild ------------------------------------------------------
  errLoadRebuild: {
    "zh-CN": "加载重建状态失败，请稍后重试。",
    "en-US": "Could not load the rebuild state. Please retry shortly.",
  },
  loadingRebuild: { "zh-CN": "正在加载重建状态…", "en-US": "Loading the rebuild state…" },
  rebuildDesc: {
    "zh-CN": "build-then-swap · 构建期检索用旧索引 · 失败不伤在线",
    "en-US": "build-then-swap · retrieval uses the old index while building · a failure never touches what is serving",
  },
  rebuildMeta: {
    "zh-CN": "org 重建并发 1/2 · 回退窗口 24h",
    "en-US": "org rebuild concurrency 1/2 · 24h rollback window",
  },
  rebuildStart: { "zh-CN": "发起重建", "en-US": "Start a rebuild" },
  stepDeclare: { "zh-CN": "声明变更", "en-US": "Declare the change" },
  stepShadow: { "zh-CN": "影子索引构建", "en-US": "Build the shadow index" },
  stepSwap: { "zh-CN": "原子切换", "en-US": "Atomic swap" },
  stepWindow: { "zh-CN": "回退窗口 24h", "en-US": "24h rollback window" },
  triggerLabel: {
    "zh-CN": (what: string) => `触发：${what}`,
    "en-US": (what: string) => `Trigger: ${what}`,
  } satisfies MessageFn<[string]>,
  shadowProgress: { "zh-CN": "影子构建进度 · bulk 队列", "en-US": "Shadow build progress · bulk queue" },
  discardShadow: { "zh-CN": "废弃影子", "en-US": "Discard the shadow" },
  rollbackLeft: {
    "zh-CN": (left: string) => `回退窗口剩 ${left}`,
    "en-US": (left: string) => `${left} left in the rollback window`,
  } satisfies MessageFn<[string]>,
  queueDetail: { "zh-CN": "排队详情", "en-US": "Queue detail" },
  whatTriggers: { "zh-CN": "什么会触发重建", "en-US": "What triggers a rebuild" },
  safetyLimits: { "zh-CN": "安全约束", "en-US": "Safety limits" },
  stewardSuggestion: { "zh-CN": "管家建议", "en-US": "Steward's suggestion" },

  // --- one task ----------------------------------------------------------------
  errLoadTask: {
    "zh-CN": "加载任务详情失败，请稍后重试。",
    "en-US": "Could not load the task. Please retry shortly.",
  },
  loadingTask: { "zh-CN": "正在加载任务详情…", "en-US": "Loading the task…" },
  cancelTask: { "zh-CN": "取消任务", "en-US": "Cancel the task" },
  rerunFromChunk: { "zh-CN": "从分块重跑", "en-US": "Re-run from chunking" },
  stewardPresent: { "zh-CN": "知识管家 · 全程在场", "en-US": "Knowledge steward · present throughout" },
  taskStewardLead: {
    "zh-CN": "解析中已做语义修复 2 处；入藏后自动萃取知识单元、关联既有条目并交叉预验——低置信内容标注待人工，",
    "en-US":
      "Two semantic repairs were made while parsing. After commit it extracts knowledge units, links them to existing entries and cross-pre-verifies; low-confidence content is flagged for a person, and ",
  },
  taskStewardStrong: {
    "zh-CN": "你只在「待确认」里做裁决",
    "en-US": "you only decide inside awaiting-your-call",
  },
  taskStewardEnd: { "zh-CN": "。", "en-US": "." },
  asideConfig: { "zh-CN": "加工配置", "en-US": "Processing config" },
  asideLineage: { "zh-CN": "血缘与幂等", "en-US": "Lineage & idempotency" },
  asideCost: { "zh-CN": "成本 · 经 Atlas 计量", "en-US": "Cost · metered through Atlas" },
  asideCostNote: { "zh-CN": "记账 → 库归属 WS", "en-US": "billed to the library's workspace" },
} satisfies Catalog;
