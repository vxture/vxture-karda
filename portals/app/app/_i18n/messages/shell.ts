import type { Catalog, MessageFn } from "../catalog";

// The product shell: the four nav domains and their sub-views, plus the chrome
// around them. These render on EVERY page, so they are the first namespace to
// exist and the one whose English half gets read most by a non-Chinese reviewer.
//
// The nav labels are also the product's information architecture (nav.ts), so
// they are translated here rather than in nav.ts itself - keeping nav.ts a pure
// structure declaration means it stays readable as an IA document.
export const shell = {
  // --- domains ---------------------------------------------------------------
  gateTitle: { "zh-CN": "访问验证", "en-US": "Access check" },
  navGroupOverview: { "zh-CN": "概览", "en-US": "Overview" },
  // DS 侧栏内建的「全组收合」可访问名(双语产品必须传,否则英文档下显中文默认值;
  // 展开/收起导航复用下方既有的 navExpand / navCollapse——同一个动作同一句话)。
  navGroupsExpand: { "zh-CN": "展开全部分组", "en-US": "Expand all groups" },
  navGroupsCollapse: { "zh-CN": "收起全部分组", "en-US": "Collapse all groups" },
  navHome: { "zh-CN": "首页", "en-US": "Home" },
  navHomeDesc: { "zh-CN": "此刻能不能用、在服务谁、可不可信", "en-US": "Usable now, serving whom, trustworthy" },
  navAssets: { "zh-CN": "知识资产", "en-US": "Knowledge assets" },
  assetDetail: { "zh-CN": "资产详情", "en-US": "Asset detail" },
  navAssetsDesc: { "zh-CN": "知识资产的统计、运营与健康", "en-US": "Asset inventory, operations and health" },
  navChannels: { "zh-CN": "供给通道", "en-US": "Supply channels" },
  navChannelsDesc: { "zh-CN": "直供与 Runos 两条供给通道", "en-US": "The direct and Runos supply channels" },
  navPipeline: { "zh-CN": "加工管道", "en-US": "Processing pipeline" },
  navPipelineDesc: { "zh-CN": "卡尔达驱动的智能加工", "en-US": "Karda-driven content processing" },
  navEvaluation: { "zh-CN": "验证评测", "en-US": "Verification & evaluation" },
  navEvaluationDesc: { "zh-CN": "验证、评测与质量基线", "en-US": "Verification, evaluation and quality baselines" },

  // --- sub-views -------------------------------------------------------------
  subChannelsOverview: { "zh-CN": "通道概览", "en-US": "Channel overview" },
  subTools: { "zh-CN": "工具面", "en-US": "Tool surface" },
  subToolsDesc: {
    "zh-CN": "Agent 可以调用的能力、计量方式与接入方式",
    "en-US": "What an agent can call, how it meters, and how to connect",
  },
  subBench: { "zh-CN": "检验台", "en-US": "Retrieval bench" },
  subFlow: { "zh-CN": "加工流水", "en-US": "Processing flow" },
  subTasks: { "zh-CN": "任务与队列", "en-US": "Tasks & queue" },
  taskDetail: { "zh-CN": "任务详情", "en-US": "Task detail" },
  subRebuild: { "zh-CN": "受控重建", "en-US": "Controlled rebuild" },
  subEvaluation: { "zh-CN": "验证与评测", "en-US": "Verify & evaluate" },
  subQueue: { "zh-CN": "待复验队列", "en-US": "Re-verification queue" },
  subSets: { "zh-CN": "评测集", "en-US": "Evaluation sets" },

  // --- chrome ----------------------------------------------------------------
  searchPlaceholder: { "zh-CN": "搜索资产、条目", "en-US": "Search assets and entries" },
  launcherLabel: { "zh-CN": "切换功能域", "en-US": "Switch domain" },
  // **Karda Super Agent(卡尔达)** —— karda 平台独有的 super agent(owner 2026-08-28)。
  // 名字是**英文**,两个语言下都一样:它是一个产品名,不是一段可翻译的措辞,翻掉了
  // 就成了另一个东西。中文「卡尔达」降为它旁边的 tag,只在中文界面出现——
  // `hubTag` 的 en-US 是空串,渲染处据此不画那个 tag。
  //
  // 旧名「管家值班台 / Steward desk」与散落各处的「知识管家」都已退役(2026-08-29 全仓清扫)。
  // 用名规则:**身份出场用全名**(这一条、`pipeline.agentPresent`),**行内指代用短名**
  // (中文「卡尔达」/ 英文 "Karda")——全名塞进句子会把句子撑散,短名能当主语。
  //
  // 右侧那块 pane 叫 **智枢 / agent hub**(2026-08-29 改名,旧名「值班台」太传统,
  // 描述的是「有人在岗值守」,而那里其实是卡尔达在把事情推给你)。它与顶栏/导航栏/
  // 内容区一样是**区域词汇**,不出现在界面上;面板标题显示的是**住在里面的那个**。
  // 指这块**外壳区域**(130-portal-shell §1 的词汇表),那是布局用词,与这个 agent
  // 的名字不是一回事:区域是家具,super agent 是住在里面的那个。
  agentName: { "zh-CN": "Karda Super Agent", "en-US": "Karda Super Agent" },
  hubTag: { "zh-CN": "卡尔达", "en-US": "" },
  // 收起的是那块 pane,不是那个 agent —— 与 `navCollapse`(收起导航)同一个句式。
  hubCollapse: { "zh-CN": "收起智枢", "en-US": "Collapse the agent hub" },
  // 导航栏的 landmark 名。菜单化之后这个 pane 才成为一个真正的 <nav>——
  // 之前它是一列卡片,没有 landmark 可言。
  navLandmark: { "zh-CN": "主导航", "en-US": "Main navigation" },
  navCollapse: { "zh-CN": "收起导航", "en-US": "Collapse navigation" },
  fullscreen: { "zh-CN": "全屏", "en-US": "Fullscreen" },
  help: { "zh-CN": "帮助", "en-US": "Help" },
  notifications: { "zh-CN": "通知", "en-US": "Notifications" },
  settings: { "zh-CN": "设置", "en-US": "Settings" },
  account: { "zh-CN": "账户", "en-US": "Account" },
  system: { "zh-CN": "系统", "en-US": "System" },
  noWorkspace: { "zh-CN": "未选择工作区", "en-US": "No workspace selected" },
  currentScope: { "zh-CN": "当前范围", "en-US": "Current scope" },
  navExpand: { "zh-CN": "展开导航", "en-US": "Expand navigation" },
  exitFullscreen: { "zh-CN": "退出全屏", "en-US": "Exit fullscreen" },
  openElsewhere: { "zh-CN": "打开别处", "en-US": "Open elsewhere" },
  launcherPanel: { "zh-CN": "功能域", "en-US": "Domains" },

  // --- preference panel ------------------------------------------------------
  // The DS panel takes every one of these as a prop; it has no locale context
  // and will not acquire one (DS 8.0.0), so the whole panel is translated here.
  prefTitle: { "zh-CN": "偏好设置", "en-US": "Preferences" },
  prefLanguage: { "zh-CN": "语言", "en-US": "Language" },
  prefTheme: { "zh-CN": "主题", "en-US": "Theme" },
  prefDensity: { "zh-CN": "密度", "en-US": "Density" },
  prefFontSize: { "zh-CN": "字号", "en-US": "Text size" },
  themeLight: { "zh-CN": "浅色", "en-US": "Light" },
  themeDark: { "zh-CN": "深色", "en-US": "Dark" },
  themeSystem: { "zh-CN": "跟随系统", "en-US": "System" },
  densityCompact: { "zh-CN": "紧凑", "en-US": "Compact" },
  densityDefault: { "zh-CN": "默认", "en-US": "Default" },
  densityComfortable: { "zh-CN": "舒适", "en-US": "Comfortable" },
  sizeSmall: { "zh-CN": "小", "en-US": "Small" },
  sizeDefault: { "zh-CN": "默认", "en-US": "Default" },
  sizeLarge: { "zh-CN": "大", "en-US": "Large" },

  // --- command palette -------------------------------------------------------
  searchEmpty: { "zh-CN": "没有匹配的结果", "en-US": "No matches" },
  searchResults: { "zh-CN": "搜索结果", "en-US": "Results" },
  groupPages: { "zh-CN": "页面", "en-US": "Pages" },
  groupActions: { "zh-CN": "动作", "en-US": "Actions" },
  benchDesc: {
    "zh-CN": "以 Agent 同款检索链路试问,验收供给质量",
    "en-US": "Try the same retrieval chain your agent uses",
  },
  kbConsole: { "zh-CN": "知识库控制台", "en-US": "Library console" },
  kbConsoleDesc: { "zh-CN": "库与文档的管理入口", "en-US": "Where libraries and documents are managed" },
  newAsset: { "zh-CN": "新建资产", "en-US": "New asset" },

  // --- account ---------------------------------------------------------------
  signOut: { "zh-CN": "退出登录", "en-US": "Sign out" },
  switchAccount: { "zh-CN": "切换账号", "en-US": "Switch account" },
  signedIn: { "zh-CN": "已登录", "en-US": "Signed in" },
  signedOut: { "zh-CN": "未登录", "en-US": "Not signed in" },
  roleOwner: { "zh-CN": "工作区属主", "en-US": "Workspace owner" },
  roleAdmin: { "zh-CN": "管理员", "en-US": "Admin" },
  roleMember: { "zh-CN": "成员", "en-US": "Member" },
  tier: { "zh-CN": "等级", "en-US": "Tier" },
  locked: { "zh-CN": "未解锁", "en-US": "Locked" },

  // --- 导航栏 cards ------------------------------------------------------------
  paneLoading: { "zh-CN": "读取中…", "en-US": "Loading…" },
  degradedChannels: { "zh-CN": "异常通道", "en-US": "Degraded" },
  // 域卡片的徽章标签。只留「需关注」这一个——「缺口」与「健康」我原本也在这里
  // 各加了一份,`catalog.test.ts` 当场报重复:它们分别已经是 `evaluation.gapsLabel`
  // 和 `states.healthHealthy`。同一句话存在两份,迟早只改其中一份。
  tagNeedsAttention: { "zh-CN": "需关注", "en-US": "Needs a look" },
  /** 环心那行小字:环画的是什么的总量。 */
  ringTotal: { "zh-CN": "总计", "en-US": "Total" },
  ringAssets: { "zh-CN": "资产", "en-US": "Assets" },
  ringEntries: { "zh-CN": "知识", "en-US": "Entries" },
  // 今日调用 / 直供通道 / 能力平台 are NOT here: they are the 供给通道 domain's
  // vocabulary, and this card renders that domain's data. Reading them from
  // `channels.ts` is what keeps the card and the page from disagreeing - they
  // did, briefly, in three words. (Written out rather than abbreviated: 直供 /
  // 能力 on their own do not read as channel names - owner 2026-08-24.)
  pipeInflight: { "zh-CN": "在制", "en-US": "In flight" },
  pipePending: { "zh-CN": "待确认", "en-US": "Awaiting review" },
  pipeFailed: { "zh-CN": "失败", "en-US": "Failed" },
  doneToday: { "zh-CN": "今日完成", "en-US": "Done today" },
  docsCount: {
    "zh-CN": (n: number) => `${n} 份`,
    "en-US": (n: number) => `${n} doc${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  /** 三段分段条的抬头:它们是队列的构成,不是主数的构成。 */
  queueNow: { "zh-CN": "当前任务", "en-US": "In the queue" },
  /** 验证评测那条合计的抬头。与 `queueNow` 同一个位置、同一个作用:
   *  说明下面三段加起来是什么,以及一共多少。 */
  corpusTotal: { "zh-CN": "语料合计", "en-US": "Corpus total" },
  rebuilding: { "zh-CN": "重建中", "en-US": "Rebuilding" },
  verifyCoverage: { "zh-CN": "验证覆盖", "en-US": "Verification coverage" },
  collapseItem: {
    "zh-CN": (label: string) => `收起${label}`,
    "en-US": (label: string) => `Collapse ${label}`,
  } satisfies MessageFn<[string]>,
  expandItem: {
    "zh-CN": (label: string) => `展开${label}`,
    "en-US": (label: string) => `Expand ${label}`,
  } satisfies MessageFn<[string]>,

  // --- 智枢 ------------------------------------------------------------------
  hubOnDuty: { "zh-CN": "在岗", "en-US": "On duty" },
  hubConnecting: { "zh-CN": "正在接入…", "en-US": "Connecting…" },
  hubPending: { "zh-CN": "待你裁决", "en-US": "Awaiting your call" },
  hubRest: {
    "zh-CN": (n: number) => `其余 ${n} 项 →`,
    "en-US": (n: number) => `${n} more →`,
  } satisfies MessageFn<[number]>,
  hubAlert: { "zh-CN": "告警", "en-US": "Alert" },
  hubGoHandle: { "zh-CN": "去处理", "en-US": "Go handle it" },
  hubActivity: { "zh-CN": "Agent 活动 · 实时", "en-US": "Agent activity · live" },
  hubDelegate: {
    "zh-CN": "低风险项全部交给卡尔达",
    "en-US": "Hand every low-risk item to Karda",
  },

  // --- scope panel / user menu -------------------------------------------------
  workspaceLabel: {
    "zh-CN": (id: string) => `工作区 ${id}`,
    "en-US": (id: string) => `Workspace ${id}`,
  } satisfies MessageFn<[string]>,
  orgLabel: {
    "zh-CN": (id: string) => `组织 ${id}`,
    "en-US": (id: string) => `Organization ${id}`,
  } satisfies MessageFn<[string]>,
  orgUnknown: { "zh-CN": "组织未知", "en-US": "Organization unknown" },
  yourRole: { "zh-CN": "你的角色", "en-US": "Your role" },
  accountId: { "zh-CN": "账号", "en-US": "Account id" },
  roleLine: {
    "zh-CN": (role: string) => `角色 · ${role}`,
    "en-US": (role: string) => `Role · ${role}`,
  } satisfies MessageFn<[string]>,
  pendingBadge: {
    "zh-CN": (n: number) => `${n} 项待裁决`,
    "en-US": (n: number) => `${n} awaiting your call`,
  } satisfies MessageFn<[number]>,
} satisfies Catalog;
