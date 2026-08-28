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
    // 原文写的是「向量服务恢复前索引暂停」——它给**每一份** processing 文档都挂上
    // 一句停摆说明,包括那些排着队、加工得好好的。而且「恢复前」把「没授权」说成了
    // 一次会自己过去的故障。真正卡住时说什么,由下面那组按档的句子负责。
    //
    // **「内容不会丢」这半句必须留着**,`states.test.ts` 有一条断言钉着它,而那条
    // 断言是对的:停在 `processing` 的文档和被丢掉的文档在界面上长得一模一样,这句
    // 话是唯一说明它没被丢的东西。我第一版把故障叙事和这个承诺一起删了,测试当场报红。
    "zh-CN": "已收下并入队,正在加工——内容不会丢。",
    "en-US": "Received and queued; processing - nothing is lost.",
  },

  /** 文档行上的前缀。「暂停」而不是「失败」:任务还在,补上之后自己继续。 */
  parkedPrefix: { "zh-CN": "加工暂停:", "en-US": "Processing paused:" },

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
    // 目录里**不能写 markdown**:界面按纯文本渲染,`**`
    // 会原样出现在屏幕上——这一条是真库截图抓到的,type-check 和测试都看不见它。
    // 强调靠措辞,不靠标记:把「不是授权问题」放在句首就够了。
    "zh-CN": "不是授权问题——端点可能已授权,是这个库锁定的模型 Atlas 上没有。请改库的模型锁,或请 Atlas 上线该模型",
    "en-US": "Not a grant problem - the endpoint may well be granted; this library pins a model Atlas does not serve. Change the library's model lock, or ask Atlas to serve it",
  },
  /** 授权补上之后会发生什么。不写这一句,人会以为还要手动重跑一遍。 */
  blockerResumeNote: {
    "zh-CN": "补上之后驻留的任务会自动继续,已加工的部分不重做",
    "en-US": "Once it lands, parked work resumes on its own - nothing already processed is redone",
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
