import type { Catalog, MessageFn } from "../catalog";

// 验证评测: the governance overview, the steward's re-verification queue, and
// the evaluation sets.
//
// This domain's numbers are the ones the product is judged on, so the wording
// around them carries more weight than usual: "覆盖 82%" means nothing until the
// reader knows what is in the denominator, and the notes below say so.
export const evaluation = {
  // --- failures ----------------------------------------------------------------
  errLoad: {
    "zh-CN": "加载验证评测失败，请稍后重试。",
    "en-US": "Could not load verification & evaluation. Please retry shortly.",
  },
  errQueue: { "zh-CN": "待复验队列加载失败。", "en-US": "Could not load the re-verification queue." },
  errVerify: { "zh-CN": "验证失败。", "en-US": "Verification failed." },
  errSweep: { "zh-CN": "续验扫描失败。", "en-US": "The re-verification sweep failed." },
  errSets: { "zh-CN": "评测集加载失败。", "en-US": "Could not load the evaluation sets." },
  errSetDetail: { "zh-CN": "评测集详情加载失败。", "en-US": "Could not load the evaluation set." },
  errCreateSet: { "zh-CN": "新建失败。", "en-US": "Could not create it." },
  errAdd: { "zh-CN": "添加失败。", "en-US": "Could not add it." },
  errRun: { "zh-CN": "运行失败。", "en-US": "The run failed." },
  errDetail: { "zh-CN": "明细加载失败。", "en-US": "Could not load the details." },

  // --- overview ------------------------------------------------------------------
  loading: { "zh-CN": "正在加载验证评测…", "en-US": "Loading verification & evaluation…" },
  pageMeta: {
    "zh-CN": (pct: number, stale: number, baseline: string) => `覆盖 ${pct}% · 待复验 ${stale} · ${baseline}`,
    "en-US": (pct: number, stale: number, baseline: string) =>
      `${pct}% covered · ${stale} to re-verify · ${baseline}`,
  } satisfies MessageFn<[number, number, string]>,
  baselineLabel: {
    "zh-CN": (name: string) => `基线 · ${name}`,
    "en-US": (name: string) => `Baseline · ${name}`,
  } satisfies MessageFn<[string]>,
  degradedSuffix: { "zh-CN": " · 链路降级", "en-US": " · chain degraded" },
  handleStale: { "zh-CN": "处理待复验", "en-US": "Work the re-verification queue" },
  statsAria: { "zh-CN": "验证评测统计", "en-US": "Verification & evaluation statistics" },
  verifiedTag: {
    "zh-CN": (n: string) => `已验证 ${n}`,
    "en-US": (n: string) => `${n} verified`,
  } satisfies MessageFn<[string]>,
  metricStale: { "zh-CN": "待复验", "en-US": "To re-verify" },
  metricStaleTag: { "zh-CN": "过期需重新确认", "en-US": "expired, needs confirming again" },
  metricPreVerified: { "zh-CN": "管家预验待确认", "en-US": "Steward pre-verified, awaiting you" },
  metricPreVerifiedTag: { "zh-CN": "低风险 · 可批量", "en-US": "low risk · confirmable in bulk" },
  metricGaps: { "zh-CN": "覆盖缺口", "en-US": "Coverage gaps" },
  metricGapsTag: { "zh-CN": "评测中查不到的问题", "en-US": "questions evaluation cannot answer" },

  govTitle: { "zh-CN": "验证治理", "en-US": "Verification governance" },
  belowFloorTitle: { "zh-CN": "低于覆盖基线的资产", "en-US": "Assets below the coverage floor" },
  belowFloorEmpty: {
    "zh-CN": (floor: number) => `没有低于基线的资产——已开启验证治理的库都在 ${floor}% 以上。`,
    "en-US": (floor: number) => `No asset is below the floor - every governed library is above ${floor}%.`,
  } satisfies MessageFn<[number]>,
  staleCount: {
    "zh-CN": (n: number) => `待复验 ${n}`,
    "en-US": (n: number) => `${n} to re-verify`,
  } satisfies MessageFn<[number]>,
  workAsset: {
    "zh-CN": (name: string) => `处理 ${name} 的待复验内容`,
    "en-US": (name: string) => `Work the re-verification backlog for ${name}`,
  } satisfies MessageFn<[string]>,

  qualityTitle: { "zh-CN": "质量评测", "en-US": "Quality evaluation" },
  setsWriteRun: { "zh-CN": "编写与运行 →", "en-US": "Write and run →" },
  questionCount: {
    "zh-CN": (n: number) => `${n} 题`,
    "en-US": (n: number) => `${n} question${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  neverRun: { "zh-CN": "未运行", "en-US": "never run" },
  gapCount: {
    "zh-CN": (n: number) => `缺口 ${n}`,
    "en-US": (n: number) => `${n} gap${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  provCorpusLive: { "zh-CN": "验证治理为实时数据", "en-US": "Verification governance is live data" },
  provCorpusDemo: { "zh-CN": "验证治理为演示数据", "en-US": "Verification governance is demo data" },
  provStewardDemo: { "zh-CN": " · 管家预验为演示数据 · ", "en-US": " · steward pre-verification is demo data · " },
  provEvalLive: { "zh-CN": "评测为实时数据", "en-US": "Evaluation is live data" },
  provEvalDemo: {
    "zh-CN": "评测口径为演示数据，评测运行器建设中",
    "en-US": "Evaluation figures are illustrative; the runner is being built",
  },

  // --- re-verification queue -----------------------------------------------------
  sweepDoneStaled: {
    "zh-CN": (scanned: number, staled: number) =>
      `续验扫描完成：扫描 ${scanned} 项，${staled} 项到期转为待复验，已加入下面的队列。`,
    "en-US": (scanned: number, staled: number) =>
      `Sweep complete: ${scanned} scanned, ${staled} passed their expiry and moved to the queue below.`,
  } satisfies MessageFn<[number, number]>,
  sweepDoneClean: {
    "zh-CN": (scanned: number) => `续验扫描完成：扫描 ${scanned} 项，没有新到期的内容。`,
    "en-US": (scanned: number) => `Sweep complete: ${scanned} scanned, nothing newly expired.`,
  } satisfies MessageFn<[number]>,
  queueScopeAll: {
    "zh-CN": "工作区内需要人工确认的内容",
    "en-US": "Everything in this workspace that needs a person to confirm it",
  },
  queueScopeOne: {
    "zh-CN": (asset: string) => `仅显示 ${asset} 的待办`,
    "en-US": (asset: string) => `Only what is outstanding for ${asset}`,
  } satisfies MessageFn<[string]>,
  thisAsset: { "zh-CN": "该资产", "en-US": "this asset" },
  queueMeta: {
    "zh-CN": (stale: number, unverified: number) => `待复验 ${stale} · 未验证 ${unverified}`,
    "en-US": (stale: number, unverified: number) => `${stale} to re-verify · ${unverified} unverified`,
  } satisfies MessageFn<[number, number]>,
  sweeping: { "zh-CN": "扫描中…", "en-US": "Sweeping…" },
  sweep: { "zh-CN": "续验扫描", "en-US": "Run the sweep" },
  backToEvaluation: { "zh-CN": "返回验证评测", "en-US": "Back to verification & evaluation" },
  // Said plainly, because the alternative is worse: a demo queue with working
  // buttons is exactly what this surface set out not to ship.
  noDatabase: {
    "zh-CN": "当前未连接数据库，队列为空。这里从不显示演示数据——带着能用按钮的演示队列，正是这一批要避免的东西。",
    "en-US":
      "No database is attached, so the queue is empty. This surface never shows demo data - a demo queue with working buttons is precisely what it set out to avoid.",
  },
  filterAria: { "zh-CN": "按验证状态筛选", "en-US": "Filter by verification state" },
  doneThisSession: {
    "zh-CN": (n: number) => `本次已处理 ${n} 项`,
    "en-US": (n: number) => `${n} handled just now`,
  } satisfies MessageFn<[number]>,
  remainingLead: { "zh-CN": "还剩 ", "en-US": "" },
  remainingTail: { "zh-CN": " 项", "en-US": " left" },
  truncatedNote: { "zh-CN": "（仅显示前 50 项）", "en-US": " (first 50 only)" },
  queueLoading: { "zh-CN": "正在加载队列…", "en-US": "Loading the queue…" },
  pageDone: { "zh-CN": "这一页处理完了", "en-US": "That is this page done" },
  queueEmpty: { "zh-CN": "没有待办", "en-US": "Nothing outstanding" },
  pageDoneHint: {
    "zh-CN": "刷新以取回下一页，或回到验证评测看覆盖率的变化。",
    "en-US": "Refresh for the next page, or go back and see what it did to coverage.",
  },
  queueEmptyHint: {
    "zh-CN": "该范围内的内容都已验证，或所在库未开启验证治理。",
    "en-US": "Everything in scope is verified, or its library has governance switched off.",
  },
  untitledEntry: { "zh-CN": "（无标题条目）", "en-US": "(untitled entry)" },
  externalSync: { "zh-CN": "外部同步", "en-US": "external sync" },
  kindDocument: { "zh-CN": "文档", "en-US": "document" },
  kindEntry: { "zh-CN": "条目", "en-US": "entry" },
  expiresAt: {
    "zh-CN": (when: string) => `${when} 到期`,
    "en-US": (when: string) => `expires ${when}`,
  } satisfies MessageFn<[string]>,
  lastVerified: {
    "zh-CN": (when: string) => `上次 ${when}`,
    "en-US": (when: string) => `last ${when}`,
  } satisfies MessageFn<[string]>,

  // --- evaluation sets -----------------------------------------------------------
  setsDesc: {
    "zh-CN": "人工编写的问题集——运行一次，就有了可比较的质量基线",
    "en-US": "Question sets written by people - run one and you have a quality baseline to compare against",
  },
  setsMeta: {
    "zh-CN": (n: number) => `${n} 个集合`,
    "en-US": (n: number) => `${n} set${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  // Why there is no demo mode here, said in full: an evaluation whose runs are
  // not persisted cannot answer "did this change help", and one with working
  // buttons would be the most misleading screen in the product.
  setsNoDatabase: {
    "zh-CN": "当前未连接数据库，评测集不可用。这里不提供演示集——运行结果不落库的评测无法回答「这次改动是变好还是变坏」，带按钮的演示评测会是产品里最误导人的界面。",
    "en-US":
      "No database is attached, so evaluation sets are unavailable. There is no demo mode here: an evaluation whose runs are not stored cannot answer whether a change helped, and one with working buttons would be the most misleading screen in the product.",
  },
  newSetTitle: { "zh-CN": "新建评测集", "en-US": "New evaluation set" },
  // KD-011: questions are written, never generated. A question synthesised from
  // the corpus can only prove that what was just indexed is retrievable, which
  // is a tautology rather than a baseline.
  newSetBlurb: {
    "zh-CN": "问题由人编写（KD-011：v1 不做合成 QA）。从语料自动生成的问题只能证明「刚索引的东西能被检索到」，那是同义反复，不是质量基线。",
    "en-US":
      "Questions are written by people (KD-011: no synthetic QA in v1). A question generated from the corpus can only prove that what was just indexed can be retrieved - a tautology, not a baseline.",
  },
  setNamePlaceholder: { "zh-CN": "集合名称", "en-US": "Set name" },
  scopeAria: { "zh-CN": "评测范围", "en-US": "Evaluation scope" },
  scopeAllAssets: { "zh-CN": "全部可见资产", "en-US": "Every visible asset" },
  okCreateSet: {
    "zh-CN": "评测集已创建。加题目后即可运行。",
    "en-US": "Evaluation set created. Add questions and it can run.",
  },
  create: { "zh-CN": "新建", "en-US": "Create" },
  setsEmpty: { "zh-CN": "还没有评测集", "en-US": "No evaluation sets yet" },
  setsEmptyHint: {
    "zh-CN": "建一个，写几道题，就能开始比较每次改动的效果。",
    "en-US": "Create one, write a few questions, and you can start comparing what each change does.",
  },
  scopeAllShort: { "zh-CN": "全部资产", "en-US": "All assets" },
  scopeCount: {
    "zh-CN": (n: number) => `${n} 个资产`,
    "en-US": (n: number) => `${n} asset${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,

  questionsTitle: {
    "zh-CN": (name: string) => `${name} · 题目`,
    "en-US": (name: string) => `${name} · questions`,
  } satisfies MessageFn<[string]>,
  // Split around two emphasised phrases: they sit in different places in each
  // language, which is exactly why this is four keys and not one template.
  evidenceBlurb1: { "zh-CN": "期望证据", "en-US": "Pick expected evidence " },
  evidenceBlurb2: { "zh-CN": "从文档里选", "en-US": "from the documents" },
  evidenceBlurb3: {
    "zh-CN": "，不手打 id：手打一个错 id 会造出永远满足不了的题，看起来像检索失败，其实是题写错了。选的是",
    "en-US":
      " rather than typing an id: one wrong id makes a question that can never be satisfied, which looks like a retrieval failure but is a badly written question. What you pick is a ",
  },
  evidenceBlurb5: {
    "zh-CN": "而非分块——分块 id 每次重建都会重生。",
    "en-US": ", not a chunk - chunk ids are reborn on every rebuild.",
  },
  noEvidenceWarning: {
    "zh-CN": "未指定期望证据——运行时会跳过这一题",
    "en-US": "No expected evidence - this question is skipped at run time",
  },
  evidenceCount: {
    "zh-CN": (n: number) => `期望证据 ${n} 项`,
    "en-US": (n: number) => `${n} expected evidence`,
  } satisfies MessageFn<[number]>,
  newQuestionPlaceholder: {
    "zh-CN": "新问题，例如：小雨条件下单架次时长是多少？",
    "en-US": "A new question, e.g. how long is one sortie in light rain?",
  },
  newQuestionAria: { "zh-CN": "新问题", "en-US": "New question" },
  expectedEvidenceLabel: { "zh-CN": "期望证据：", "en-US": "Expected evidence: " },
  noDocsInScope: { "zh-CN": "该范围内没有文档可选。", "en-US": "No documents in scope to choose from." },
  addQuestion: { "zh-CN": "添加题目", "en-US": "Add question" },

  runTitle: { "zh-CN": "运行", "en-US": "Run" },
  runBlurb1: { "zh-CN": "走的是 Agent 同款检索链路。", "en-US": "It uses the same retrieval chain your agent does. The " },
  runBlurb2: { "zh-CN": "基线标签", "en-US": "baseline label" },
  runBlurb3: {
    "zh-CN": "是这次运行跑在什么之上——「这次改动有没有帮助」只有在两次都说清了跑的是什么时才回答得了。",
    "en-US":
      " records what this run ran on top of - \"did that change help\" is answerable only when both runs said what they were.",
  },
  baselinePlaceholder: {
    "zh-CN": "基线标签，例如 bge-m3@v2 或 chunk-512",
    "en-US": "Baseline label, e.g. bge-m3@v2 or chunk-512",
  },
  baselineAria: { "zh-CN": "基线标签", "en-US": "Baseline label" },
  okRunRegression: {
    "zh-CN": "运行完成——检测到质量回退，见下方对比。",
    "en-US": "Run complete - a regression was detected; see the comparison below.",
  },
  okRun: { "zh-CN": "运行完成。", "en-US": "Run complete." },
  running: { "zh-CN": "运行中…", "en-US": "Running…" },
  runIt: { "zh-CN": "运行评测", "en-US": "Run the evaluation" },
  addQuestionsFirst: { "zh-CN": "先加题目。", "en-US": "Add some questions first." },

  historyTitle: { "zh-CN": "历史", "en-US": "History" },
  historyBlurb: {
    "zh-CN": "每次运行与同一集合上一次完成的运行相比。",
    "en-US": "Each run is compared with the previous completed run of the same set.",
  },
  chainDegraded: { "zh-CN": "链路降级", "en-US": "chain degraded" },
  regression: { "zh-CN": "回退", "en-US": "regression" },
  perQuestion: { "zh-CN": "逐题", "en-US": "per question" },

  thisRun: { "zh-CN": "本次运行", "en-US": "This run" },
  runSkipped: {
    "zh-CN": (n: number) => ` · 跳过 ${n} 题（未指定期望证据）`,
    "en-US": (n: number) => ` · ${n} skipped (no expected evidence)`,
  } satisfies MessageFn<[number]>,
  runComparedTo: {
    "zh-CN": (label: string) => ` · 对比「${label}」`,
    "en-US": (label: string) => ` · compared with "${label}"`,
  } satisfies MessageFn<[string]>,
  runNoPrevious: { "zh-CN": " · 无可对比的历史运行", "en-US": " · no earlier run to compare with" },
  // NULL is not zero: without a generation backend those two metrics were not
  // measured, and rendering them as 0% would read as a total failure.
  noAnsweringBackend: {
    "zh-CN": "本机未配置生成后端（Atlas A4），引用准确率与有据回答率本次「未测量」——不是 0%。召回命中率仍然有效。",
    "en-US":
      "No generation backend (Atlas A4) is configured here, so citation precision and grounded-answer rate were NOT MEASURED this run - they are not 0%. Recall hit rate is still valid.",
  },
  degradedRunWarning: {
    "zh-CN": "本次运行链路降级（重排不可用），与未降级的运行不可直接比较。",
    "en-US": "This run was degraded (rerank unavailable) and cannot be compared directly with an undegraded one.",
  },
  notComparable: { "zh-CN": "无可比", "en-US": "not comparable" },
  // Read by the 导航栏 card too: gaps are this domain's measure, and two
  // copies of the word is how the card and the page come to disagree.
  gapsLabel: { "zh-CN": "缺口", "en-US": "Gaps" },
  gapsHint: { "zh-CN": "证据没被召回的题", "en-US": "questions whose evidence was not recalled" },
  perQuestionTitle: { "zh-CN": "逐题结果", "en-US": "Per-question results" },
  perQuestionBlurb: {
    "zh-CN": "缺口在最上面——那是要去看的行，不该被通过的题埋起来。",
    "en-US": "Gaps come first: those are the rows to look at, and passing questions should not bury them.",
  },
  recalled: { "zh-CN": "已召回", "en-US": "recalled" },
  gapBadge: { "zh-CN": "缺口", "en-US": "gap" },
  noCitations: { "zh-CN": "无引用", "en-US": "no citations" },
  citationHits: {
    "zh-CN": (hit: number, total: number) => `${hit}/${total} 引用命中`,
    "en-US": (hit: number, total: number) => `${hit}/${total} citations on target`,
  } satisfies MessageFn<[number, number]>,
  // The metric NAMES and what each one measures. They were also authored in
  // `kb/evaluation/quality-read.ts`, beside the figures - a second copy of a
  // fixed list of three.
  metricRecall: { "zh-CN": "召回命中率", "en-US": "Recall hit rate" },
  metricRecallHint: {
    "zh-CN": "评测集问题中，正确证据出现在召回结果里的比例",
    "en-US": "Of the set's questions, the share whose correct evidence appeared in the recalled results",
  },
  metricCitationHint: {
    "zh-CN": "回答引用的条目里，真正支撑该回答的比例",
    "en-US": "Of the entries an answer cited, the share that actually support it",
  },
  // The demo overlay carries a fourth metric the live reader does not compute.
  // Missing it from the key map is what took the page down: the map is indexed
  // by a value the DATA chooses, so it has to cover everything the data can say.
  metricLatency: { "zh-CN": "检索 P95", "en-US": "Retrieval P95" },
  metricLatencyHint: {
    "zh-CN": "自请求进入到候选集返回的端到端耗时",
    "en-US": "End-to-end time from the request arriving to the candidate set coming back",
  },
  metricGroundedHint: {
    "zh-CN": "回答完全由检索证据支撑、未自由发挥的比例",
    "en-US": "The share of answers carried entirely by retrieved evidence, with nothing invented",
  },
  metricCitation: { "zh-CN": "引用准确率", "en-US": "Citation precision" },
  metricGrounded: { "zh-CN": "有据回答率", "en-US": "Grounded answer rate" },
} satisfies Catalog;
