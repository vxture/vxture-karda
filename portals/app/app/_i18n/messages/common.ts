import type { Message, MessageFn } from "../catalog";

// Strings that belong to no single domain: verbs, states, and the wording of
// outcomes. Kept small on purpose - a common namespace that grows without limit
// becomes a place to avoid naming things.
export const common = {
  // --- verbs -----------------------------------------------------------------
  save: { "zh-CN": "保存", "en-US": "Save" },
  cancel: { "zh-CN": "取消", "en-US": "Cancel" },
  confirm: { "zh-CN": "确认", "en-US": "Confirm" },
  delete: { "zh-CN": "删除", "en-US": "Delete" },
  rename: { "zh-CN": "重命名", "en-US": "Rename" },
  retry: { "zh-CN": "重试", "en-US": "Retry" },
  close: { "zh-CN": "关闭", "en-US": "Close" },
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
  signInExpired: { "zh-CN": "登录已过期，请重新登录。", "en-US": "Your session expired. Please sign in again." },
  forbidden: { "zh-CN": "你没有执行该操作的权限。", "en-US": "You do not have permission to do that." },
  notFound: { "zh-CN": "没找到——它可能属于另一个工作区。", "en-US": "Not found - it may belong to another workspace." },
  serverError: { "zh-CN": "服务端出错了，请重试。", "en-US": "Something went wrong on our side. Please retry." },
} satisfies Record<string, Message | MessageFn<never>>;
