import type { Catalog, Message, MessageFn } from "../catalog";

// Cross-domain vocabulary: the state machines' labels and the wording of API
// outcomes. These live in their own namespace rather than in `assets` because
// every domain renders them - a document's 已入藏 badge appears on the asset
// page, in the governance queue and in the evaluation gap list, and three
// copies of that word is how they end up disagreeing.
//
// The labels moved OUT of `_lib/format.ts` and the tones stayed. That split is
// the point: a tone is a structural fact about a state (failed is bad, indexed
// is ok) and does not vary by language; a label is nothing but language.
export const states = {
  // --- sharing ladder --------------------------------------------------------
  sharePrivate: { "zh-CN": "私有", "en-US": "Private" },
  sharePrivateHelp: { "zh-CN": "只有你能看到这个库。", "en-US": "Only you can see this library." },
  shareWorkspace: { "zh-CN": "工作区", "en-US": "Workspace" },
  shareWorkspaceHelp: { "zh-CN": "本工作区成员可读。", "en-US": "Members of this workspace can read it." },
  shareOrg: { "zh-CN": "组织", "en-US": "Organization" },
  shareOrgHelp: { "zh-CN": "组织内所有人可读。", "en-US": "Everyone in the organization can read it." },

  // --- content state ---------------------------------------------------------
  contentDraft: { "zh-CN": "草稿", "en-US": "Draft" },
  contentProcessing: { "zh-CN": "加工中", "en-US": "Processing" },
  contentIndexed: { "zh-CN": "已入藏", "en-US": "Indexed" },
  contentFailed: { "zh-CN": "失败", "en-US": "Failed" },
  contentArchived: { "zh-CN": "已归档", "en-US": "Archived" },
  contentDeleted: { "zh-CN": "已删除", "en-US": "Deleted" },
  processingHint: {
    "zh-CN": "已收下并入队。向量服务恢复前索引暂停——内容不会丢。",
    "en-US": "Received and queued. Indexing is paused until the embedding service returns - nothing is lost.",
  },

  // --- verification state ----------------------------------------------------
  verifUnverified: { "zh-CN": "未验证", "en-US": "Unverified" },
  verifVerified: { "zh-CN": "已验证", "en-US": "Verified" },
  verifStale: { "zh-CN": "待复验", "en-US": "Stale" },
  intervalOnce: { "zh-CN": "一次性（不过期）", "en-US": "once, never expires" },
  intervalEvery: {
    "zh-CN": (days: number) => `每 ${days} 天`,
    "en-US": (days: number) => `every ${days} day${days === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,

  // --- API outcomes ----------------------------------------------------------
  // Kept as prose here and as CODES on the wire. That seam is deliberate: a
  // route answers `{"error":"not_found"}` and the client renders the sentence,
  // so translating the product never means touching an API contract.
  errSessionExpired: { "zh-CN": "登录已过期，请重新登录。", "en-US": "Your session expired. Please sign in again." },
  errForbidden: { "zh-CN": "你没有执行该操作的权限。", "en-US": "You do not have permission to do that." },
  errRefused: { "zh-CN": "这个操作被拒绝了。", "en-US": "That operation was refused." },
  errNotFound: { "zh-CN": "没找到——它可能属于另一个工作区。", "en-US": "Not found - it may belong to another workspace." },
  errServer: { "zh-CN": "服务端出错了，请重试。", "en-US": "Something went wrong on our side. Please retry." },
  errConflict: { "zh-CN": "和已存在的内容冲突。", "en-US": "Conflicts with something that already exists." },
  errDuplicateDocument: { "zh-CN": "这份内容已经在库里了。", "en-US": "This content is already in the library." },
  errNameTaken: { "zh-CN": "这个工作区里已经有同名的库了。", "en-US": "A library with that name already exists in this workspace." },
  errNameRequired: { "zh-CN": "请填写名称。", "en-US": "A name is required." },
  errUnknownConnector: { "zh-CN": "未知的连接器。", "en-US": "Unknown connector." },
  errIllegalTransition: {
    "zh-CN": "当前状态不允许这个操作——撤销是终态，无法恢复。",
    "en-US": "The current state does not allow that - revoke is terminal and cannot be undone.",
  },
  errBindingExists: {
    "zh-CN": "这个来源标识已经绑定过本库了——可能仍在用，也可能是撤销后永久占位；撤销不可逆，无法重新绑定。",
    "en-US":
      "That source id is already bound to this library - either still in use, or permanently held by a revoked binding. Revoke is irreversible; it cannot be bound again.",
  },

  // --- asset health ----------------------------------------------------------
  // Cross-domain by evidence: the 导航栏 card tags an asset count with 需关注
  // and the homepage card tags one asset with it. Two copies of that word is
  // how they end up disagreeing.
  healthHealthy: { "zh-CN": "健康", "en-US": "Healthy" },
  healthAttention: { "zh-CN": "需关注", "en-US": "Needs attention" },
  healthProcessing: { "zh-CN": "加工中", "en-US": "Processing" },
  healthGap: { "zh-CN": "有缺口", "en-US": "Has gaps" },

  // --- verification clock ----------------------------------------------------
  // `kb/governance/record.ts` decides WHICH of these applies; these are only
  // the words. Day counts arrive already absolute.
  recordLapsed: { "zh-CN": "已过期，待复验", "en-US": "Lapsed - awaiting re-verification" },
  recordLapsedDays: {
    "zh-CN": (d: number) => `已过期 ${d} 天，待复验`,
    "en-US": (d: number) => `Lapsed ${d} day${d === 1 ? "" : "s"} ago - awaiting re-verification`,
  } satisfies MessageFn<[number]>,
  recordNoInterval: {
    "zh-CN": "已验证 · 不设复验间隔",
    "en-US": "Verified - no re-verification interval",
  },
  recordOverdueDays: {
    "zh-CN": (d: number) => `已超期 ${d} 天，等待续验扫描`,
    "en-US": (d: number) => `${d} day${d === 1 ? "" : "s"} past expiry - awaiting the sweep`,
  } satisfies MessageFn<[number]>,
  recordDueToday: { "zh-CN": "今天到期", "en-US": "Expires today" },
  recordDueDays: {
    "zh-CN": (d: number) => `${d} 天后到期`,
    "en-US": (d: number) => `Expires in ${d} day${d === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
} satisfies Catalog;

// Keeps the `Message`-only import honest now that the table also holds
// functions: every plain entry above is still a full locale pair.
export type StatesTable = typeof states;
const _plainAreMessages: Message = states.sharePrivate;
void _plainAreMessages;
