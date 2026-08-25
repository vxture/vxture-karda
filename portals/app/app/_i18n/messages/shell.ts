import type { Message } from "../catalog";

// The product shell: the four nav domains and their sub-views, plus the chrome
// around them. These render on EVERY page, so they are the first namespace to
// exist and the one whose English half gets read most by a non-Chinese reviewer.
//
// The nav labels are also the product's information architecture (nav.ts), so
// they are translated here rather than in nav.ts itself - keeping nav.ts a pure
// structure declaration means it stays readable as an IA document.
export const shell = {
  // --- domains ---------------------------------------------------------------
  navAssets: { "zh-CN": "知识资产", "en-US": "Knowledge assets" },
  navAssetsDesc: { "zh-CN": "知识资产的统计、运营与健康", "en-US": "Asset inventory, operations and health" },
  navChannels: { "zh-CN": "供给通道", "en-US": "Supply channels" },
  navChannelsDesc: { "zh-CN": "直供与 Runos 两条供给通道", "en-US": "The direct and Runos supply channels" },
  navPipeline: { "zh-CN": "加工管道", "en-US": "Processing pipeline" },
  navPipelineDesc: { "zh-CN": "知识管家驱动的智能加工", "en-US": "Steward-driven content processing" },
  navEvaluation: { "zh-CN": "验证评测", "en-US": "Verification & evaluation" },
  navEvaluationDesc: { "zh-CN": "验证、评测与质量基线", "en-US": "Verification, evaluation and quality baselines" },

  // --- sub-views -------------------------------------------------------------
  subChannelsOverview: { "zh-CN": "通道概览", "en-US": "Channel overview" },
  subTools: { "zh-CN": "工具面", "en-US": "Tool surface" },
  subBench: { "zh-CN": "检验台", "en-US": "Retrieval bench" },
  subFlow: { "zh-CN": "加工流水", "en-US": "Processing flow" },
  subTasks: { "zh-CN": "任务与队列", "en-US": "Tasks & queue" },
  subRebuild: { "zh-CN": "受控重建", "en-US": "Controlled rebuild" },
  subEvaluation: { "zh-CN": "验证与评测", "en-US": "Verify & evaluate" },
  subQueue: { "zh-CN": "待复验队列", "en-US": "Re-verification queue" },
  subSets: { "zh-CN": "评测集", "en-US": "Evaluation sets" },

  // --- chrome ----------------------------------------------------------------
  searchPlaceholder: { "zh-CN": "搜索资产、条目", "en-US": "Search assets and entries" },
  launcherLabel: { "zh-CN": "切换功能域", "en-US": "Switch domain" },
  dock: { "zh-CN": "管家值班台", "en-US": "Steward desk" },
  dockCollapse: { "zh-CN": "收起值班台", "en-US": "Collapse steward desk" },
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
  dockOpen: { "zh-CN": "管家值班台", "en-US": "Steward desk" },
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
  signIn: { "zh-CN": "登录", "en-US": "Sign in" },
  signOut: { "zh-CN": "退出登录", "en-US": "Sign out" },
  switchAccount: { "zh-CN": "切换账号", "en-US": "Switch account" },
  signedIn: { "zh-CN": "已登录", "en-US": "Signed in" },
  signedOut: { "zh-CN": "未登录", "en-US": "Not signed in" },
  roleOwner: { "zh-CN": "工作区属主", "en-US": "Workspace owner" },
  roleAdmin: { "zh-CN": "管理员", "en-US": "Admin" },
  roleMember: { "zh-CN": "成员", "en-US": "Member" },
  tier: { "zh-CN": "等级", "en-US": "Tier" },
  locked: { "zh-CN": "未解锁", "en-US": "Locked" },
} satisfies Record<string, Message>;
