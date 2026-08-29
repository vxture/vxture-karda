import type { Message, MessageFn } from "../catalog";

// Strings that belong to no single domain: verbs, states, and the wording of
// outcomes. Kept small on purpose - a common namespace that grows without limit
// becomes a place to avoid naming things.
export const common = {
  // --- verbs -----------------------------------------------------------------
  save: { "zh-CN": "保存", "en-US": "Save" },
  /** 卡片操作区右侧那个去处。动作名而不是「更多」——它去的是一个确定的页面。 */
  enter: { "zh-CN": "进入", "en-US": "Open" },
  cancel: { "zh-CN": "取消", "en-US": "Cancel" },
  confirm: { "zh-CN": "确认", "en-US": "Confirm" },
  delete: { "zh-CN": "删除", "en-US": "Delete" },
  rename: { "zh-CN": "重命名", "en-US": "Rename" },
  retry: { "zh-CN": "重试", "en-US": "Retry" },
  pause: { "zh-CN": "暂停", "en-US": "Pause" },
  close: { "zh-CN": "关闭", "en-US": "Close" },
  all: { "zh-CN": "全部", "en-US": "All" },

  // --- the sign-in gate --------------------------------------------------------
  // Rendered by `_lib/ui.tsx` on every page that needs a session, so it belongs
  // to no domain.
  signInTitle: { "zh-CN": "登录后使用", "en-US": "Sign in to continue" },
  signInBody: {
    "zh-CN": "登录已过期，或你还没有登录。",
    "en-US": "Your session expired, or you have not signed in yet.",
  },
  signIn: { "zh-CN": "登录", "en-US": "Sign in" },
  expand: { "zh-CN": "展开", "en-US": "Expand" },
  collapse: { "zh-CN": "收起", "en-US": "Collapse" },

  // --- 翻页 ---------------------------------------------------------------
  //
  // DS 的 `Pagination` 自带默认文案,但那套默认是**它的语言**不是产品的:真库上
  // 一看,翻页按钮印着 "Previous page / Next page",夹在一整屏中文里(owner 2026-08-30
  // 那次改版当场看见)。件留了口子,产品就该把口子填上——双语产品的每一句都得能换。
  pagerPrev: { "zh-CN": "上一页", "en-US": "Previous" },
  pagerNext: { "zh-CN": "下一页", "en-US": "Next" },
  pagerSizeLabel: { "zh-CN": "每页条数", "en-US": "Rows per page" },
  /** 模板而不是拼串:中文是「每页 25 条」,英文是「25 per page」,语序不同——
   *  件替调用方拼就等于替它定了语序(DS 自己在 `pageSizeOptionTemplate` 上写了同一条)。 */
  pagerSizeTemplate: { "zh-CN": "每页 {size} 条", "en-US": "{size} per page" },
  /** 批量条的计数语。槽位 {count} / {noun}；模板而不是拼串，语序归产品——
   *  中文数词在前，英文 selected 在后，件替调用方定语序是越界（DS 自己的注释这么写，
   *  但它的运行时默认是英文的，真库上看见「2 条断言 selected」）。 */
  bulkSelectedTemplate: { "zh-CN": "已选择 {count} {noun}", "en-US": "{count} {noun} selected" },
  /** 翻页条左侧计数。DS 默认是英文的 "N records"——同一条「默认文案要覆盖」的规矩。 */
  pagerCount: {
    "zh-CN": (n: number) => `共 ${n} 条`,
    "en-US": (n: number) => `${n} record${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,

  // --- states ----------------------------------------------------------------
  loading: { "zh-CN": "载入中…", "en-US": "Loading…" },
  running: { "zh-CN": "执行中…", "en-US": "Running…" },
  empty: { "zh-CN": "暂无内容", "en-US": "Nothing here yet" },
  notMeasured: { "zh-CN": "未测量", "en-US": "Not measured" },

  // A count with its unit. A FUNCTION, not a template: Chinese puts the
  // quantifier between number and noun ("3 份文档") where English puts a plural
  // suffix on the noun ("3 documents"), and one template cannot do both.
  documentCount: {
    "zh-CN": (n: number) => `${n} 份文档`,
    "en-US": (n: number) => `${n} document${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,

  itemCount: {
    "zh-CN": (n: number) => `${n} 项`,
    "en-US": (n: number) => `${n} item${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,

  // --- outcomes --------------------------------------------------------------
  // API failure prose used to be duplicated here, verbatim, from `states.ts`.
  // It was never read - nothing imported this namespace at all - so the product
  // had a second, untested copy of its error catalog sitting inside the very
  // layer that exists to stop exactly that. `states.ts` owns it; `apiErrorKey`
  // maps to it; `states.test.ts` pins its wording. Deleted 2026-08-26.
  deleteFailed: { "zh-CN": "删除失败。", "en-US": "Delete failed." },
} satisfies Record<string, Message | MessageFn<never>>;
