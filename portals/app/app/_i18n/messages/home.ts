import type { Catalog } from "../catalog";

// 首页的文案(150-page-architecture §2)。
//
// 结构照着那三个问题排:能不能用 / 谁在用 / 可不可信。可用性的状态与原因来自
// `kb/home/readiness.ts`,那边发的是**码**,这里是码对应的话——「码在线上,散文在
// 调用点」。同一个状态因此在两种语言下说的是同一件事。
export const home = {
  // --- 页头 ---------------------------------------------------------------
  title: { "zh-CN": "文渊", "en-US": "Karda" },
  tagline: {
    "zh-CN": "Agent 的共享知识底座",
    "en-US": "Shared knowledge infrastructure for agents",
  },
  lede: {
    "zh-CN": "一处存放、一处治理、一处供给——所有 agent 引用同一份可追溯的知识。",
    "en-US": "Stored once, governed once, served once - every agent cites the same traceable knowledge.",
  },

  // --- 三问 ---------------------------------------------------------------
  q1: { "zh-CN": "能不能用", "en-US": "Usable now" },
  q2: { "zh-CN": "在服务谁", "en-US": "Serving whom" },
  q3: { "zh-CN": "可不可信", "en-US": "Trustworthy" },

  // --- 可用性状态 ---------------------------------------------------------
  stateReady: { "zh-CN": "检索链路通", "en-US": "Retrieval is live" },
  stateDegraded: { "zh-CN": "可用,但有一部分卡住", "en-US": "Usable, with something stuck" },
  stateUnavailable: { "zh-CN": "当前不可用", "en-US": "Not usable right now" },
  stateEmpty: { "zh-CN": "还没有内容", "en-US": "Nothing ingested yet" },

  // --- 原因(与 ReadinessReason 一一对应)---------------------------------
  reasonCapability: {
    "zh-CN": "模型能力尚未授权,加工管线提交不了——文档进不了可检索状态",
    "en-US": "The model capability is not granted, so the pipeline cannot commit - nothing becomes retrievable",
  },
  reasonQuota: {
    "zh-CN": "配额已用尽。任务驻留中,配额恢复后自动继续,不需要人处理",
    "en-US": "Quota is exhausted. Work is parked and resumes on its own - nobody needs to act",
  },
  reasonFailures: {
    "zh-CN": "有任务常驻失败,需要人看一眼",
    "en-US": "Some tasks are failed and resident - they need a human",
  },
  reasonProcessing: {
    "zh-CN": "文档正在加工,还没有走完",
    "en-US": "Documents are still being processed",
  },
  reasonNothing: {
    "zh-CN": "这个工作区还没有任何文档",
    "en-US": "This workspace has no documents yet",
  },

  // --- 卡在哪一件事上,以及去哪修 -------------------------------------------
  //
  // owner 2026-08-28:「如果那一条授权没有,你需要反馈错误信息,如『xxxx 授权失败,
  // 请在 xxxx 完成授权』。」此前四种「用不了」共用一句「模型能力尚未授权」,而它们
  // 的**修复人和修复地点各不相同**——只说「未授权」等于谁都不知道该动手。
  //
  // 每一档都写成两截:**缺什么** + **谁在哪补**。第二截不能是仓库里的文件路径
  // ——对着已部署产品的人打不开它。操作单仍然给,但它是给在仓里干活的人的补充,
  // 不是「去哪修」的答案。
  blockerAtlasNotConfigured: {
    "zh-CN": "本部署尚未接入 Atlas(缺服务地址或凭据)。请运维在本产品的环境配置中补齐,与平台授权无关",
    "en-US": "This deployment is not connected to Atlas (missing base URL or credentials). Operations must complete it in this product's environment config - unrelated to any platform grant",
  },
  blockerWorkspaceNotProvisioned: {
    "zh-CN": "本工作区尚未在平台完成 karda 开通,换不到调用令牌。请在平台为该工作区开通本产品",
    "en-US": "This workspace has no karda instance provisioned on the platform, so no call token can be issued. Provision this product for the workspace on the platform",
  },
  blockerEndpointNotGranted: {
    "zh-CN": "端点未授权给产品 karda。请在平台管理面为产品 karda 授予该端点",
    "en-US": "This endpoint is not granted to product karda. Grant it to product karda in the platform console",
  },
  blockerModelNotRoutable: {
    "zh-CN": "点名的模型路由不到。**这不是授权问题**——端点可能已授权,是这个库锁定的模型 Atlas 上没有。请改库的模型锁,或请 Atlas 上线该模型",
    "en-US": "The pinned model cannot be routed. **This is not a grant problem** - the endpoint may well be granted; this library pins a model Atlas does not serve. Change the library's model lock, or ask Atlas to serve it",
  },
  /** 授权补上之后会发生什么。不写这一句,人会以为还要手动重跑一遍。 */
  blockerResumeNote: {
    "zh-CN": "补上之后驻留的任务会自动继续,已加工的部分不重做",
    "en-US": "Once it lands, parked work resumes on its own - nothing already processed is redone",
  },

  // --- 下一步 -------------------------------------------------------------
  /** 有具体清单时的指针。不认领执行方——清单里每一条已经点名了自己的修复人。 */
  actionRunbook: { "zh-CN": "操作单:", "en-US": "Runbook:" },
  actionOps: {
    "zh-CN": "这件事要运维做,不在本应用内。操作单:",
    "en-US": "This is an operations task, outside this app. Runbook:",
  },
  actionGoTasks: { "zh-CN": "去看任务", "en-US": "Open tasks" },
  actionGoNew: { "zh-CN": "上传第一份文档", "en-US": "Upload the first document" },

  // --- 事实数 -------------------------------------------------------------
  factRetrievable: { "zh-CN": "可检索文档", "en-US": "Retrievable documents" },
  factDocuments: { "zh-CN": "文档总数", "en-US": "Documents in total" },
  factParked: { "zh-CN": "驻留任务", "en-US": "Parked tasks" },
  factFailed: { "zh-CN": "常驻失败", "en-US": "Failed, resident" },

  // 第二、三问的数**是什么**。不复用域描述——那句话在下面的入口卡片里已经有了,
  // 同一屏说两遍会让人以为是两个不同的东西。
  //
  // 「今日调用」也不在这里另写一遍:它是 `channels.callsToday`,目录测试第二次
  // 抓到我重复(第一次是四个域名)。同一个量在两处各有一份文案,改了一处另一处
  // 就成了旧说法——而没有任何东西会报。
  q3Metric: { "zh-CN": "验证覆盖率", "en-US": "Verified coverage" },

  // --- 板块入口 -----------------------------------------------------------
  // 四个域的**名字与职责不在这里**:它们是 `shell.nav*` / `shell.nav*Desc`,首页
  // 直接复用。目录测试抓到过一次重复——两处各写一遍,意味着改了导航之后首页还挂着
  // 旧名,而没有任何东西会报。域叫什么、干什么,只该有一个来源。
  enterHint: { "zh-CN": "进入", "en-US": "Enter" },

  // --- 其他 ---------------------------------------------------------------
  loading: { "zh-CN": "读取中", "en-US": "Loading" },
  unreachable: {
    "zh-CN": "读不到可用性——这本身是一个信号,不要当成正常",
    "en-US": "Readiness could not be read - that is itself a signal, do not read it as fine",
  },
} satisfies Catalog;
