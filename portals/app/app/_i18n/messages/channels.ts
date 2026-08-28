import type { Catalog, MessageFn } from "../catalog";

// 供给通道: the channel dashboard, the tool surface and the retrieval bench -
// the CONSUMER-facing half of the product, which is also the half most likely
// to be read by someone who does not read Chinese.
//
// Channel and capability state names live here rather than beside the data.
// They used to be authored per channel (`stateLabel`), which put nuance in a
// badge - "待注册 · 503 失败关闭" - that the activation card already states in
// a full sentence. The badge names the state; the sentence explains it.
export const channels = {
  // --- channel / capability state --------------------------------------------
  stateLive: { "zh-CN": "服务中", "en-US": "Serving" },
  stateDegraded: { "zh-CN": "降级服务", "en-US": "Degraded" },
  stateOff: { "zh-CN": "待注册", "en-US": "Not registered" },
  statusStable: { "zh-CN": "已注册 · 稳定", "en-US": "Registered · stable" },
  statusPending: { "zh-CN": "待注册", "en-US": "Registration pending" },
  statusUnregistered: { "zh-CN": "未登记", "en-US": "Unregistered" },
  riskWrite: { "zh-CN": "写", "en-US": "Write" },
  riskRead: { "zh-CN": "读", "en-US": "Read" },

  // --- page head + stats -----------------------------------------------------
  errLoad: { "zh-CN": "加载供给通道失败，请稍后重试。", "en-US": "Could not load the supply channels. Please retry shortly." },
  loading: { "zh-CN": "正在加载供给通道…", "en-US": "Loading supply channels…" },
  pageMeta: {
    "zh-CN": (calls: string, direct: number, runos: number, p95: number) =>
      `今日 ${calls} 次 · 直供 ${direct} · Runos ${runos} · P95 ${p95}ms`,
    "en-US": (calls: string, direct: number, runos: number, p95: number) =>
      `${calls} calls today · direct ${direct} · Runos ${runos} · P95 ${p95}ms`,
  } satisfies MessageFn<[string, number, number, number]>,
  statsAria: { "zh-CN": "供给通道统计", "en-US": "Supply channel statistics" },
  metricDirect: { "zh-CN": "直供 · S2S", "en-US": "Direct · S2S" },
  metricP95: { "zh-CN": "检索 P95", "en-US": "Retrieval P95" },

  // --- channel health --------------------------------------------------------
  sectionHealth: { "zh-CN": "通道健康", "en-US": "Channel health" },
  /** 卡片页脚那一行的引导词:后面跟的是消费方,不是通道。 */
  servingNow: { "zh-CN": "在服务", "en-US": "Serving" },
  callsTotal: { "zh-CN": "累计调用", "en-US": "Calls to date" },
  callsToday: { "zh-CN": "今日调用", "en-US": "Calls today" },
  errorRate: { "zh-CN": "错误率", "en-US": "Error rate" },

  // --- capability contract ---------------------------------------------------
  sectionCapabilities: { "zh-CN": "能力契约", "en-US": "Capability contract" },
  capCallsToday: {
    "zh-CN": (n: string) => `今日 ${n}`,
    "en-US": (n: string) => `${n} today`,
  } satisfies MessageFn<[string]>,

  // --- failing consumers -----------------------------------------------------
  sectionDiagnosis: { "zh-CN": "异常消费方", "en-US": "Failing consumers" },
  // Sorted by failure COUNT, not rate, and the note says why - an operator who
  // does not know that will chase a 100% rate over four calls.
  diagnosisNote: {
    "zh-CN": "按失败量排序，不是按失败率——4 次调用全挂是 100%，但通常无关紧要；400 次里挂 48 次才是事故。",
    "en-US":
      "Ranked by failure COUNT, not rate: four calls all failing is 100% and usually does not matter; 48 failures out of 400 is an incident.",
  },
  ownProduct: { "zh-CN": "（本产品）", "en-US": "(this product)" },
  failedCount: {
    "zh-CN": (n: number) => `失败 ${n}`,
    "en-US": (n: number) => `${n} failed`,
  } satisfies MessageFn<[number]>,
  viaRunos: { "zh-CN": "能力平台", "en-US": "Capability platform" },
  viaDirect: { "zh-CN": "直供通道", "en-US": "Direct channel" },

  // --- consumers / activation ------------------------------------------------
  sectionConsumers: { "zh-CN": "消费方 · 今日", "en-US": "Consumers · today" },
  sectionActivation: { "zh-CN": "通道启用", "en-US": "Channel activation" },
  // Split around the emphasis: the stressed clause sits at the end in Chinese
  // and mid-sentence in English.
  activationLead: {
    "zh-CN": "Runos 通道端点已实现，尚未完成注册；未配置凭证时端点 ",
    "en-US": "The Runos channel endpoint is built but not yet registered. With no credential configured it fails closed with a ",
  },
  activationTail: {
    "zh-CN": "失败关闭，",
    "en-US": ", and ",
  },
  activationStrong: {
    "zh-CN": "不会伪装成可用",
    "en-US": "never pretends to be available",
  },
  activationEnd: { "zh-CN": "。", "en-US": "." },

  // --- provenance ------------------------------------------------------------
  provLive: { "zh-CN": "调用与消费为实时账本", "en-US": "Calls and consumers come from the live ledger" },
  provDemo: {
    "zh-CN": "调用与消费为演示口径，供给账本随通道里程碑交付",
    "en-US": "Calls and consumers are illustrative; the supply ledger ships with the channel milestone",
  },
  provRegistry: {
    "zh-CN": " · 通道状态与能力契约为登记口径（非账本推导）",
    "en-US": " · channel state and the capability contract are registry facts, not derived from the ledger",
  },

  // --- 工具面 (tool surface) ---------------------------------------------------
  errLoadTools: { "zh-CN": "工具面加载失败。", "en-US": "Could not load the tool surface." },
  toolsLoading: { "zh-CN": "正在加载工具面…", "en-US": "Loading the tool surface…" },
  toolsMeta: {
    "zh-CN": (n: number, protocol: string) => `${n} 个工具 · 协议 ${protocol}`,
    "en-US": (n: number, protocol: string) => `${n} tool${n === 1 ? "" : "s"} · protocol ${protocol}`,
  } satisfies MessageFn<[number, string]>,
  toolsToBench: { "zh-CN": "去检验台试问", "en-US": "Try it on the bench" },

  meteringTitle: { "zh-CN": "计量", "en-US": "Metering" },
  // States the ONE thing an integrator gets wrong: karda does not pre-check
  // quota, so a call that would exceed it is answered, not refused.
  meteringLead: {
    "zh-CN": (metered: number, free: number) =>
      `先看这个：${metered} 个工具产生计量，${free} 个不产生。AI 额度由平台层判定——karda 这边调用进来就响应，不预检、不因额度拒绝。`,
    "en-US": (metered: number, free: number) =>
      `Read this first: ${metered} tool${metered === 1 ? "" : "s"} meter, ${free} do not. AI quota is decided by the platform layer - karda answers whatever arrives, with no pre-check and no quota refusal.`,
  } satisfies MessageFn<[number, number]>,
  meterNone: { "zh-CN": "不计费", "en-US": "Free" },
  meterNoneDetail: { "zh-CN": "不产生 karda 侧计量", "en-US": "produces no karda-side metering" },
  meterPerCall: { "zh-CN": "按调用", "en-US": "Per call" },
  meterPerCallDetail: { "zh-CN": "每次调用计一次", "en-US": "one unit per call" },
  meterPerDoc: { "zh-CN": "按文档", "en-US": "Per document" },
  meterPerDocDetail: { "zh-CN": "按写入的文档条数计", "en-US": "counted by documents written" },

  accessTitle: { "zh-CN": "接入方式", "en-US": "How to connect" },
  accessSameBackend: {
    "zh-CN": "两道门，同一套后端——选哪道门不改变你拿到的东西。",
    "en-US": "Two doors, one backend - which door you pick does not change what you get.",
  },
  accessTwoChannels: { "zh-CN": "两个通道。", "en-US": "Two channels." },
  accessAuth: {
    "zh-CN": (auth: string) => `鉴权：${auth}`,
    "en-US": (auth: string) => `Auth: ${auth}`,
  } satisfies MessageFn<[string]>,

  // obo_only is a constraint on integration design, not a footnote: a
  // service-identity agent simply cannot call these tools.
  modeAny: { "zh-CN": "OBO 或服务身份", "en-US": "OBO or service identity" },
  modeAnyDetail: {
    "zh-CN": "可代表某个用户调用，也可用服务身份调用",
    "en-US": "may be called on behalf of a user, or with a service identity",
  },
  modeOboOnly: { "zh-CN": "仅 OBO", "en-US": "OBO only" },
  modeOboOnlyDetail: {
    "zh-CN": "必须代表一个真实用户——写入类工具不接受纯服务身份",
    "en-US": "must act for a real user - write tools do not accept a bare service identity",
  },

  toolsListTitle: { "zh-CN": "工具", "en-US": "Tools" },
  toolsListLead: {
    "zh-CN": (path: string) => `这份清单与 ${path} 发的是同一份描述符，不会各说各话。`,
    "en-US": (path: string) => `This list and ${path} serve the same descriptor - they cannot disagree.`,
  } satisfies MessageFn<[string]>,

  // --- 检验台 (retrieval bench) ------------------------------------------------
  errLoadKbs: { "zh-CN": "库列表加载失败。", "en-US": "Could not load the library list." },
  errQuery: { "zh-CN": "查询失败。", "en-US": "The query failed." },
  benchMeta: {
    "zh-CN": (visible: number, chosen: number) =>
      `可见 ${visible} 个资产${chosen > 0 ? ` · 已选 ${chosen}` : ""}`,
    "en-US": (visible: number, chosen: number) =>
      `${visible} asset${visible === 1 ? "" : "s"} visible${chosen > 0 ? ` · ${chosen} selected` : ""}`,
  } satisfies MessageFn<[number, number]>,
  modeSearch: { "zh-CN": "检索", "en-US": "Search" },
  modeAsk: { "zh-CN": "问答", "en-US": "Ask" },
  modeAria: { "zh-CN": "模式", "en-US": "Mode" },
  // No separate aria entry for the search box: its accessible name IS its
  // placeholder here, so a second key would only be a copy to keep in step.
  queryPlaceholderSearch: { "zh-CN": "检索词", "en-US": "Search terms" },
  queryPlaceholderAsk: { "zh-CN": "提问", "en-US": "Ask a question" },
  queryAriaAsk: { "zh-CN": "问题", "en-US": "Question" },
  runSearch: { "zh-CN": "执行检索", "en-US": "Run search" },
  runAsk: { "zh-CN": "生成回答", "en-US": "Generate answer" },

  // The verification filter - the control that decides what "not found" means.
  tierLabel: { "zh-CN": "质量档", "en-US": "Quality tier" },
  tierVerifiedOnly: { "zh-CN": "仅已验证", "en-US": "Verified only" },
  tierVerifiedOnlyHint: {
    "zh-CN": "只召回经人工验证且未过期的内容——最严，也最少",
    "en-US": "Recalls only human-verified, unexpired content - the strictest tier, and the smallest",
  },
  tierDefault: { "zh-CN": "已验证 + 未纳管", "en-US": "Verified + untracked" },
  tierDefaultHint: {
    "zh-CN": "默认档：已验证的，加上所在库未开治理的内容",
    "en-US": "The default: verified content, plus anything in a library with governance off",
  },
  tierAll: { "zh-CN": "全部", "en-US": "Everything" },
  tierAllHint: {
    "zh-CN": "包括过期与未验证内容——用于排查「为什么查不到」",
    "en-US": "Includes stale and unverified content - for working out why something is missing",
  },
  topK: { "zh-CN": "返回条数", "en-US": "Results returned" },
  scopeLabel: { "zh-CN": "范围", "en-US": "Scope" },
  scopeAll: { "zh-CN": "：可见的全部资产", "en-US": ": every visible asset" },
  scopeClear: { "zh-CN": "清空", "en-US": "Clear" },

  askUnavailable: {
    "zh-CN": "问答尚未接通：本机没有配置 Atlas 生成后端（A4）。检索仍可用。",
    "en-US": "Ask is not wired here: no Atlas generation backend (A4) is configured. Search still works.",
  },
  noHits: { "zh-CN": "没有命中", "en-US": "No hits" },
  noHitsStrict: {
    "zh-CN": "当前是「仅已验证」档——放宽到「全部」再试一次，可以区分「没有内容」和「内容没验证」。",
    "en-US":
      "You are on the verified-only tier. Widen it to Everything and try again - that separates \"there is nothing\" from \"nothing is verified\".",
  },
  noHitsGeneric: {
    "zh-CN": "内容需要先完成加工与索引才可被检索。",
    "en-US": "Content has to finish processing and indexing before it can be retrieved.",
  },
  // karda refuses to answer without grounds; the empty state says so, because a
  // blank answer with no explanation reads as a bug.
  noGrounds: { "zh-CN": "没有找到可作依据的内容——因此没有生成回答", "en-US": "No grounds were found, so no answer was generated" },
  noGroundsDesc: {
    "zh-CN": "karda 不会在没有依据时编答案。放宽质量档或扩大范围再试。",
    "en-US": "karda does not invent an answer without grounds. Widen the quality tier or the scope and try again.",
  },
  answerLabel: { "zh-CN": "回答", "en-US": "Answer" },
  citationsLabel: {
    "zh-CN": (n: number) => `引用 (${n})`,
    "en-US": (n: number) => `Citations (${n})`,
  } satisfies MessageFn<[number]>,

  // --- disclosures: what happened underneath ---------------------------------
  chainClean: { "zh-CN": "链路完整", "en-US": "Chain intact" },
  chainDegraded: { "zh-CN": "有降级", "en-US": "Degraded" },
  scopeSearched: {
    "zh-CN": (n: number) => `实际检索了 ${n} 个资产`,
    "en-US": (n: number) => `searched ${n} asset${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  degradedRerank: {
    "zh-CN": "重排不可用，当前顺序来自关键词/向量融合（RRF）。结果是真的，但排序不是生产排序——不要据此判断排序质量。",
    "en-US":
      "Rerank is unavailable; this order comes from keyword/vector fusion (RRF). The results are real, but the ORDER is not the production order - do not judge ranking quality from it.",
  },
  degradedPartial: {
    "zh-CN": "部分命名空间查询失败，本次结果不完整。缺的是哪一部分无法得知——这比少了几条更值得注意。",
    "en-US":
      "Some namespaces failed to answer, so this result is incomplete. WHICH part is missing cannot be known - that matters more than how many rows are gone.",
  },
  ignoredLead: {
    "zh-CN": (n: number) => `指定的 ${n} 个资产不在可见范围内，已被忽略：`,
    "en-US": (n: number) => `${n} of the assets you named are outside what you can see and were ignored: `,
  } satisfies MessageFn<[number]>,
  ignoredTail: {
    "zh-CN": "。它们不是「没有命中」，是「你看不到」。",
    "en-US": ". They did not miss - they were never visible to you.",
  },
  ignoredJoin: { "zh-CN": "、", "en-US": ", " },
  chainCleanNote: {
    "zh-CN": "重排可用、无命名空间失败、无被忽略的资产。这一次的结果可以按生产表现来读。",
    "en-US":
      "Rerank available, no namespace failures, no ignored assets. This run can be read as production behaviour.",
  },
} satisfies Catalog;
