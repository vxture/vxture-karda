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
