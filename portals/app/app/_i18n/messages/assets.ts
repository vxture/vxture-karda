import type { Catalog, MessageFn } from "../catalog";

// The assets domain: the library index, the create form, the asset detail page
// and its four panels (documents, settings, bindings, folders).
//
// State labels are NOT here - they live in `states.ts`, because a document's
// badge reads the same on this page, in the governance queue and in the
// evaluation gap list. What lives here is wording that only makes sense on an
// asset surface.
export const assets = {
  // --- library index / create ------------------------------------------------
  // Split around the bench link because the two languages put it in different
  // places: Chinese trails it with a clause, English opens a sentence with it.
  createNameLabel: { "zh-CN": "资产名称", "en-US": "Asset name" },
  createDescLabel: { "zh-CN": "资产描述", "en-US": "Asset description" },
  createDescPlaceholder: { "zh-CN": "描述（可选）", "en-US": "Description (optional)" },
  createPending: { "zh-CN": "创建中…", "en-US": "Creating…" },
  // --- 新建流程(150 §3.1:title=动作名,description=做完会发生什么,返回=取消) ----
  createFlowDesc: {
    "zh-CN": "创建后直接进入新库——上传、接源、配置都在那里。",
    "en-US": "You land in the new library right after - uploading, sources and settings all live there.",
  },
  createGo: { "zh-CN": "创建", "en-US": "Create" },
  createNamePlaceholder: { "zh-CN": "例如「投标知识库」", "en-US": 'e.g. "Bid library"' },
  /** 语义与治理默认写在选择器旁边(KD-218:模式决定页面形状),复用设置页那三句。 */
  createTemplateHint: {
    "zh-CN": "决定文件如何被切成可检索的块;之后可在设置里换。",
    "en-US": "How files are chunked for retrieval; changeable later in settings.",
  },
  createHint: {
    "zh-CN": "新建的资产默认私有，创建后再决定共享范围。",
    "en-US": "New assets start private; choose the sharing grade after creating.",
  },

  // --- failures --------------------------------------------------------------
  errLoadList: { "zh-CN": "资产列表加载失败。", "en-US": "Could not load the asset list." },
  errCreate: { "zh-CN": "创建失败。", "en-US": "Could not create the asset." },

  // --- documents panel -------------------------------------------------------
  docUnfiled: { "zh-CN": "未归档", "en-US": "Unfiled" },
  docFilterAria: { "zh-CN": "按目录筛选", "en-US": "Filter by folder" },
  uploadPickAria: { "zh-CN": "选择要上传的文档", "en-US": "Choose a document to upload" },
  uploadButton: { "zh-CN": "上传文档", "en-US": "Upload document" },
  /** 筛在某个目录上时,按钮自己说这一份会落在哪儿——那个「上传至」下拉因此可以去掉,
   *  它和目录芯片问的是同一个问题,而两个控件能给出两个不同的答案。 */
  uploadToFolder: {
    "zh-CN": (folder: string) => `上传到「${folder}」`,
    "en-US": (folder: string) => `Upload to "${folder}"`,
  } satisfies MessageFn<[string]>,
  // `uploadHint`(「文件入库即排队加工;卡住时会在该文档下说明原因。」)随上传卡片
  // 一起去掉了,**不是丢了信息**:空态里的 `docEmptyHint` 说了同一句的前半("上传
  // 一个文件,它会自动排队加工"),后半由每一份文档自己那行「加工暂停:…」负责——
  // 那一行知道是哪一档、去哪补,而常驻在工具栏上的那句谁都不针对。
  /** 分布图里把长尾并起来的那一条。带数量,因为「其余」不说几个等于没说。 */
  restAssets: {
    "zh-CN": (n: number) => `其余 ${n} 个资产`,
    "en-US": (n: number) => `${n} more assets`,
  },
  // --- 文档清单:找得到一份 ------------------------------------------------------
  //
  // 这一页此前把库里**全部**文档一次铺完(演示库里是 94 到 412 行),没有搜索、没有
  // 排序。在那种长度上,「这份文件在不在库里」这个最常见的问题只能靠滚动和肉眼。
  // --- 知识确认台(KD-222) -----------------------------------------------------
  //
  // 抽取流在这一页闭环:卡尔达抽出的断言落为草稿(「写入不等于进入检索」),
  // **人确认**才收录进检索与供给。确认 = 收录 + 验证,一个动作——拆成两个按钮,
  // 就会出现「已收录但没人确认」这个既进了检索又没人负责的中间态。
  knowledgeLabel: { "zh-CN": "知识", "en-US": "Knowledge" },
  knowledgeTitle: {
    "zh-CN": (name: string) => `${name} · 知识`,
    "en-US": (name: string) => `${name} - knowledge`,
  } satisfies MessageFn<[string]>,
  knowledgeDesc: {
    "zh-CN": "卡尔达从这个库抽取的断言与实体;经你确认后才进入检索与供给。",
    "en-US": "What Karda extracted from this library; nothing enters retrieval until you confirm it.",
  },
  knowledgeMeta: {
    "zh-CN": (d: number, a: number, e: number) => `${d} 待确认 · ${a} 已收录 · ${e} 实体`,
    "en-US": (d: number, a: number, e: number) => `${d} to confirm · ${a} admitted · ${e} entities`,
  } satisfies MessageFn<[number, number, number]>,
  kNeverRanHint: {
    "zh-CN": "文档入藏后,抽取会按批自动进行;产出先落在「待确认」,由你决定收录与否。",
    "en-US": "Extraction runs in batches once documents are indexed; output lands in the confirmation queue for you to admit or discard.",
  },
  /** 触到读取上限。说「最近 N 条」而不是装作展示了全部——静默截断读起来像全量。 */
  kCapped: {
    "zh-CN": (n: number) => `已达读取上限,仅显示最近 ${n} 条断言。`,
    "en-US": (n: number) => `Read cap reached - showing the most recent ${n} assertions.`,
  } satisfies MessageFn<[number]>,

  kScopeDrafts: { "zh-CN": "待确认", "en-US": "To confirm" },
  kScopeAdmitted: { "zh-CN": "已收录", "en-US": "Admitted" },
  kScopeEntities: { "zh-CN": "实体", "en-US": "Entities" },
  kSearchAssertions: { "zh-CN": "按断言或主题搜索", "en-US": "Search statement or subject" },
  kSearchEntities: { "zh-CN": "按名称搜索", "en-US": "Search by name" },

  kColAssertion: { "zh-CN": "断言", "en-US": "Assertion" },
  kColKind: { "zh-CN": "类型", "en-US": "Kind" },
  kColConfidence: { "zh-CN": "置信", "en-US": "Confidence" },
  kColSource: { "zh-CN": "出处", "en-US": "Source" },
  kColVerification: { "zh-CN": "验证状态", "en-US": "Verification" },
  kColValidity: { "zh-CN": "时效", "en-US": "Validity" },
  kColMentions: { "zh-CN": "被提及", "en-US": "Mentions" },

  // 断言类型词表(kinds.ts 的语言侧)。认不出的值原样返回,与状态标签同一条规矩。
  kKindFact: { "zh-CN": "事实", "en-US": "Fact" },
  kKindClaim: { "zh-CN": "主张", "en-US": "Claim" },
  kKindEvent: { "zh-CN": "事件", "en-US": "Event" },
  kKindProcedure: { "zh-CN": "规程", "en-US": "Procedure" },
  kKindRule: { "zh-CN": "规则", "en-US": "Rule" },

  actConfirm: { "zh-CN": "确认收录", "en-US": "Confirm & admit" },
  actDiscard: { "zh-CN": "剔除", "en-US": "Discard" },
  actAdopt: { "zh-CN": "采信此条", "en-US": "Adopt this one" },
  /** BulkActionBar 的计数名词:「已选择 3 条断言」。 */
  kNoun: { "zh-CN": "条断言", "en-US": "assertions" },
  kDiscardConsequence: {
    "zh-CN": "剔除后这条断言从所有读面消失;行保留在审计窗口内,但没有恢复入口。",
    "en-US": "A discarded assertion disappears from every read surface; the row is kept for the audit window, but there is no way back.",
  },
  kDiscardBulkTarget: {
    "zh-CN": (n: number) => `${n} 条断言`,
    "en-US": (n: number) => `${n} assertion${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,

  // --- 冲突与裁决 ---------------------------------------------------------------
  kConflictsTitle: {
    "zh-CN": (n: number) => `${n} 组互相矛盾的断言`,
    "en-US": (n: number) => `${n} conflicting group${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  kConflictsHint: {
    "zh-CN": "同一主题下有不同说法。采信其中一条,其余保留、但标记为已被取代。",
    "en-US": "Different statements about the same subject. Adopt one; the rest are kept but marked superseded.",
  },
  kAdoptDialogTitle: { "zh-CN": "采信这一条?", "en-US": "Adopt this statement?" },
  /** 「没有反向操作」必须写在按钮前面,不能等人问。 */
  kAdoptConsequence: {
    "zh-CN": (n: number) =>
      `这一条将被确认收录;其余 ${n} 条标记为「已被取代」——保留可查,检索与工具会标注其已让位。这一步没有反向操作。`,
    "en-US": (n: number) =>
      `This one is confirmed and admitted; the other ${n} are marked superseded - kept and inspectable, but every tool will flag them as displaced. There is no undo.`,
  } satisfies MessageFn<[number]>,
  kAdoptGo: { "zh-CN": "采信", "en-US": "Adopt" },
  kSuperseded: { "zh-CN": "已被取代", "en-US": "Superseded" },

  // --- 行内事实 ----------------------------------------------------------------
  kAssertedBy: {
    "zh-CN": (who: string) => `据 ${who}`,
    "en-US": (who: string) => `per ${who}`,
  } satisfies MessageFn<[string]>,
  kAsOf: {
    "zh-CN": (when: string) => `${when} 起`,
    "en-US": (when: string) => `from ${when}`,
  } satisfies MessageFn<[string]>,
  kValidUntil: {
    "zh-CN": (when: string) => `至 ${when}`,
    "en-US": (when: string) => `until ${when}`,
  } satisfies MessageFn<[string]>,
  kSourceOf: {
    "zh-CN": (title: string, v: number) => `出处:${title} · 第 ${v} 版`,
    "en-US": (title: string, v: number) => `Source: ${title} · v${v}`,
  } satisfies MessageFn<[string, number]>,

  // --- 处置结果 ----------------------------------------------------------------
  okKConfirm: {
    "zh-CN": (n: number) => `已确认收录 ${n} 条。`,
    "en-US": (n: number) => `Confirmed and admitted ${n}.`,
  } satisfies MessageFn<[number]>,
  /** 差额照实说:请求与实际改动不一致 = 有几条被并发处置了,不是这次失败了。 */
  okKConfirmPartial: {
    "zh-CN": (n: number, missed: number) => `已确认 ${n} 条;另有 ${missed} 条已被并发处置,列表已刷新。`,
    "en-US": (n: number, missed: number) => `Confirmed ${n}; ${missed} had already been handled elsewhere - the list is refreshed.`,
  } satisfies MessageFn<[number, number]>,
  okKDiscard: {
    "zh-CN": (n: number) => `已剔除 ${n} 条。`,
    "en-US": (n: number) => `Discarded ${n}.`,
  } satisfies MessageFn<[number]>,
  okKAdopt: {
    "zh-CN": (n: number) => `已采信;${n} 条标记为被取代。`,
    "en-US": (n: number) => `Adopted; ${n} marked superseded.`,
  } satisfies MessageFn<[number]>,
  errKnowledgeLoad: { "zh-CN": "知识数据加载失败。", "en-US": "Could not load the knowledge data." },
  errKnowledgeAct: { "zh-CN": "处置失败。", "en-US": "The action failed." },
  errAdjStale: {
    "zh-CN": "这组冲突刚被别处处理过,列表已刷新——请重新判断。",
    "en-US": "This conflict was just handled elsewhere; the list is refreshed - judge again.",
  },

  // --- 空态(三个 scope 三句话,与文档清单同一条规矩) ----------------------------
  kDraftsEmpty: { "zh-CN": "没有等着你的断言", "en-US": "Nothing waiting for you" },
  kDraftsEmptyHint: {
    "zh-CN": "卡尔达抽取后,新断言会先落在这里,由你确认收录。",
    "en-US": "Freshly extracted assertions land here for you to confirm.",
  },
  kAdmittedEmpty: { "zh-CN": "还没有已收录的断言", "en-US": "Nothing admitted yet" },
  kAdmittedEmptyHint: {
    "zh-CN": "在「待确认」里确认收录后,断言才进入检索与供给。",
    "en-US": "Assertions enter retrieval and serving only after you confirm them in the queue.",
  },
  kEntitiesEmpty: { "zh-CN": "还没有实体", "en-US": "No entities yet" },
  kEntitiesEmptyHint: {
    "zh-CN": "实体随断言抽出;有断言提及它们时才会出现在这里。",
    "en-US": "Entities come out of assertions; they appear once assertions mention them.",
  },
  // 分两个键而不是一句通用的「没有匹配的结果」：那句已经是顶栏全局搜索的词（shell.searchEmpty），
  // 而且越具体越好——人知道自己搜的是断言还是实体。
  kNoMatchAssertions: { "zh-CN": "没有匹配的断言", "en-US": "No assertions match" },
  kNoMatchEntities: { "zh-CN": "没有匹配的实体", "en-US": "No entities match" },

  // --- 文档表:列名与视图 ----------------------------------------------------
  //
  // 它此前不是一张表,是一堆用 flex 摆出来的「看起来像表」的行:没有表头,于是那四
  // 列没有名字;没有排序控件,于是排序只能另放一个下拉;没有分页,于是自己写了一个
  // 「显示更多」。DS 里这三件都有(`DataTable` / `Pagination` / `ViewModeSwitch`),
  // 而自己搭的那一套既少功能又与别的清单页长得不一样(owner 2026-08-30)。
  docColStatus: { "zh-CN": "状态", "en-US": "Status" },
  docColUpdated: { "zh-CN": "更新", "en-US": "Updated" },
  docColSize: { "zh-CN": "大小", "en-US": "Size" },
  docColActions: { "zh-CN": "操作", "en-US": "Actions" },
  docViewAria: { "zh-CN": "文档展示方式", "en-US": "Document view" },
  docViewList: { "zh-CN": "列表", "en-US": "List" },
  docViewCards: { "zh-CN": "卡片", "en-US": "Cards" },
  docTableAria: { "zh-CN": "文档表", "en-US": "Documents table" },
  /** 分页器左侧那句计数。DS 默认写「共 N 条记录」,这里要的是「份」。 */
  docPageCount: {
    "zh-CN": (total: number) => `共 ${total} 份文档`,
    "en-US": (total: number) => `${total} document${total === 1 ? "" : "s"} in total`,
  } satisfies MessageFn<[number]>,
  docPageCountFiltered: {
    "zh-CN": (shown: number, total: number) => `筛选后 ${shown} 份 · 共 ${total} 份`,
    "en-US": (shown: number, total: number) => `${shown} of ${total} after filtering`,
  } satisfies MessageFn<[number, number]>,
  docSearchPlaceholder: { "zh-CN": "按标题搜索", "en-US": "Search by title" },
  docSearchAria: { "zh-CN": "按标题搜索文档", "en-US": "Search documents by title" },
  docSortAria: { "zh-CN": "文档排序方式", "en-US": "Sort documents" },
  docSortRecent: { "zh-CN": "最近更新", "en-US": "Recently updated" },
  docSortOldest: { "zh-CN": "最早加入", "en-US": "Oldest first" },
  docSortTitle: { "zh-CN": "标题", "en-US": "Title" },
  /** 搜出来是空的,和这个库是空的**不是一回事**——后者要引导上传,前者要给一条退路。 */
  docNoMatch: { "zh-CN": "没有匹配的文档", "en-US": "No documents match" },
  docNoMatchHint: {
    "zh-CN": "换个词,或清空搜索看全部。",
    "en-US": "Try another word, or clear the search to see everything.",
  },
  docClearSearch: { "zh-CN": "清空搜索", "en-US": "Clear search" },
  docLoading: { "zh-CN": "正在加载文档…", "en-US": "Loading documents…" },
  docEmpty: { "zh-CN": "还没有文档", "en-US": "No documents yet" },
  docEmptyFolder: { "zh-CN": "该目录下没有文档", "en-US": "No documents in this folder" },
  docEmptyHint: {
    "zh-CN": "上传一个文件，它会自动排队加工。",
    "en-US": "Upload a file and it will queue for processing on its own.",
  },
  failedCount: {
    "zh-CN": (n: number) => `${n} 件加工失败`,
    "en-US": (n: number) => `${n} failed to process`,
  } satisfies MessageFn<[number]>,
  failedHint: {
    "zh-CN": "修掉原因后重新加工；文档不会被丢弃，失败是一个可停留的状态。",
    "en-US": "Fix the cause, then reprocess. Nothing is discarded - failure is a state a document is allowed to sit in.",
  },

  // --- document row actions --------------------------------------------------
  actPreview: { "zh-CN": "预览", "en-US": "Preview" },
  actDownload: { "zh-CN": "下载", "en-US": "Download" },
  actReprocess: { "zh-CN": "重新加工", "en-US": "Reprocess" },
  actVerify: { "zh-CN": "验证", "en-US": "Verify" },
  actReverify: { "zh-CN": "重新验证", "en-US": "Re-verify" },
  // The DELETE contract. `deleted` is terminal in the content state machine, so
  // the consequence has to say so - this is the sentence the confirm dialog
  // shows, and DS 9 makes it mandatory rather than optional.
  deleteConsequence: {
    "zh-CN": "文档将退出检索且无法恢复；已发布的引用会失去依据。",
    "en-US": "The document leaves retrieval and cannot be restored; published citations lose their basis.",
  },
  verifiedWhen: {
    "zh-CN": (when: string) => `${when} 验证`,
    "en-US": (when: string) => `Verified ${when}`,
  } satisfies MessageFn<[string]>,
  /**
   * 验证人。
   *
   * 这里印的是**账号标识**(`usr_...`),不是姓名——产品里没有人员目录,凭空显示一个
   * 名字就是编的。能做的是给这串东西一个标签:在此之前它只是「· 」后面一串来历不明
   * 的字符,读的人无从知道那是谁、还是什么编号。
   */
  verifiedBy: {
    "zh-CN": (who: string) => `验证人 ${who}`,
    "en-US": (who: string) => `by ${who}`,
  } satisfies MessageFn<[string]>,

  // --- preview dialog --------------------------------------------------------
  unknownMime: { "zh-CN": "未知类型", "en-US": "Unknown type" },
  downloadOriginal: { "zh-CN": "下载原件", "en-US": "Download original" },

  // --- asset detail: header and tabs -----------------------------------------
  kbLoading: { "zh-CN": "正在加载库…", "en-US": "Loading the library…" },
  backToAssets: { "zh-CN": "返回知识资产", "en-US": "Back to knowledge assets" },
  metaDocs: {
    "zh-CN": (n: number) => `${n} 文档`,
    "en-US": (n: number) => `${n} document${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  metaFailed: {
    "zh-CN": (n: number) => `${n} 失败`,
    "en-US": (n: number) => `${n} failed`,
  } satisfies MessageFn<[number]>,
  /** 设置页的返回:回到这个库,不是回到资产列表——返回要回到**上一层**。 */
  backToLibrary: { "zh-CN": "返回本库", "en-US": "Back to the library" },
  settingsTitle: {
    "zh-CN": (name: string) => `${name} · 设置`,
    "en-US": (name: string) => `${name} - settings`,
  } satisfies MessageFn<[string]>,
  settingsDesc: {
    "zh-CN": "按内容的一生排:入库 → 加工 → 检索 → 治理 → 共享。",
    "en-US": "Ordered the way content lives: ingest, process, retrieve, govern, share.",
  },

  // --- 来源模式 ----------------------------------------------------------------
  //
  // 一个库的**真相住在哪**。这不是一个开关的名字,是这一页的形状:自建库根本没有
  // 「外部来源」这一格,采集库则以来源与同步状态为主角。
  modeCardTitle: { "zh-CN": "来源模式", "en-US": "Source mode" },
  modeOwned: { "zh-CN": "自建", "en-US": "Self-owned" },
  modeSynced: { "zh-CN": "采集", "en-US": "Synced" },
  modeOwnedDesc: {
    "zh-CN": "内容由你放进来(上传 / API 写入),真相就在这里,全部纳入治理。",
    "en-US": "You put the content here (upload or API). The truth is here, and all of it is governed.",
  },
  modeSyncedDesc: {
    "zh-CN": "内容从外部来源同步进来,真相在源头,默认豁免本地复验。",
    "en-US": "Content is synced from an external source. The truth is upstream, so local re-verification is exempt by default.",
  },
  /** 「默认不是约束」这一句必须写在选择器旁边,否则采集库里那份手工文件看起来像违规。 */
  modeHint: {
    "zh-CN": "这是默认,不是限制:采集库仍可手工补充,补进来的那份照常纳入治理。",
    "en-US": "A default, not a restriction: you can still add files by hand to a synced library - those are governed normally.",
  },
  /** 切模式**不搬内容**。人最怕的是「按一下东西就没了」,先把这句说掉。 */
  modeSwitchHint: {
    "zh-CN": "切换模式不会动已有内容,只改变这一页的默认与形状。",
    "en-US": "Switching does not move any content - it changes this page's defaults and shape.",
  },
  /** 采集 -> 自建,而外部来源还连着:这是唯一一个切换会留下矛盾的方向。 */
  modeSwitchWarn: {
    "zh-CN": (n: number) => `这个库还有 ${n} 个在用的外部来源。转为自建后它们仍会同步,请先撤销。`,
    "en-US": (n: number) =>
      `${n} external source${n === 1 ? " is" : "s are"} still live. They keep syncing after the switch - revoke them first.`,
  } satisfies MessageFn<[number]>,
  okModeSwitch: {
    "zh-CN": (mode: string) => `来源模式已改为「${mode}」。`,
    "en-US": (mode: string) => `Source mode is now "${mode}".`,
  } satisfies MessageFn<[string]>,
  errModeSwitch: { "zh-CN": "来源模式保存失败。", "en-US": "Could not save the source mode." },
  /** 采集库里的手工文件。它不是错误,但它和周围那些同步来的不是一回事。 */
  docLocalAdd: { "zh-CN": "本地补充", "en-US": "Added locally" },
  docLocalAddHint: {
    "zh-CN": "手工放进这个采集库的内容:源头不会更新它,治理照常适用。",
    "en-US": "Added by hand to a synced library: upstream will not update it, and governance applies as normal.",
  },

  tabDocuments: { "zh-CN": "文档", "en-US": "Documents" },
  tabBindings: { "zh-CN": "外部来源", "en-US": "External sources" },
  /** 不再是一个 tab 的名字：设置已经是自己的一页（子路由），这个键既做入口按钮也做那一页的名字。 */
  settingsLabel: { "zh-CN": "设置", "en-US": "Settings" },

  // --- asset detail: mutation outcomes ---------------------------------------
  // Quoting is a per-language convention, which is exactly why these are
  // functions: Chinese brackets a name with 「」 and English with double quotes,
  // and a shared `{name}` template would have forced one convention on both.
  errLoadDocs: { "zh-CN": "文档列表加载失败。", "en-US": "Could not load the document list." },
  errLoadKb: { "zh-CN": "库信息加载失败。", "en-US": "Could not load the library." },
  errLoadFolders: { "zh-CN": "目录加载失败。", "en-US": "Could not load the folders." },
  errLoadTemplates: { "zh-CN": "加工模板列表加载失败。", "en-US": "Could not load the processing templates." },
  errLoadFields: { "zh-CN": "字段声明加载失败。", "en-US": "Could not load the metadata fields." },
  errLoadBindings: { "zh-CN": "外部来源加载失败。", "en-US": "Could not load the external sources." },
  errLoadConnectors: { "zh-CN": "连接器目录加载失败。", "en-US": "Could not load the connector catalogue." },

  errUpload: { "zh-CN": "上传失败。", "en-US": "Upload failed." },
  okUpload: {
    "zh-CN": (name: string) => `已上传「${name}」。`,
    "en-US": (name: string) => `Uploaded "${name}".`,
  } satisfies MessageFn<[string]>,
  errVerifyDoc: { "zh-CN": "文档验证失败。", "en-US": "Could not verify the document." },
  okVerifyDoc: {
    "zh-CN": (title: string) => `已验证「${title}」。`,
    "en-US": (title: string) => `Verified "${title}".`,
  } satisfies MessageFn<[string]>,
  errReprocess: { "zh-CN": "重新加工失败。", "en-US": "Could not reprocess." },
  // Deliberately not "done": reprocess puts the document back in the queue.
  okReprocess: {
    "zh-CN": (title: string) => `「${title}」已重新排队加工。`,
    "en-US": (title: string) => `"${title}" is queued for processing again.`,
  } satisfies MessageFn<[string]>,

  errBind: { "zh-CN": "绑定失败。", "en-US": "Could not create the binding." },
  okBind: {
    "zh-CN": (connector: string, source: string) => `已绑定 ${connector} · ${source}，将从回填开始。`,
    "en-US": (connector: string, source: string) => `Bound ${connector} · ${source}; it will start with a backfill.`,
  } satisfies MessageFn<[string, string]>,
  errBindingAction: { "zh-CN": "操作失败。", "en-US": "That operation failed." },
  okRevoke: {
    "zh-CN": (source: string, n: number) => `已撤销 ${source}，${n} 份文档已退出检索。`,
    "en-US": (source: string, n: number) =>
      `Revoked ${source}; ${n} document${n === 1 ? "" : "s"} left retrieval.`,
  } satisfies MessageFn<[string, number]>,
  okPause: { "zh-CN": "已暂停同步。", "en-US": "Sync paused." },
  okResume: { "zh-CN": "已恢复同步。", "en-US": "Sync resumed." },

  errShare: { "zh-CN": "共享档位切换失败。", "en-US": "Could not change the sharing grade." },
  okShare: {
    "zh-CN": (grade: string) => `共享档位已设为「${grade}」。`,
    "en-US": (grade: string) => `Sharing grade set to "${grade}".`,
  } satisfies MessageFn<[string]>,
  errTemplate: { "zh-CN": "加工模板切换失败。", "en-US": "Could not change the processing template." },
  okTemplate: {
    "zh-CN": "加工模板已保存。仅对此后加工的文档生效。",
    "en-US": "Processing template saved. It applies to documents processed from now on.",
  },
  errGovernanceToggle: { "zh-CN": "治理开关切换失败。", "en-US": "Could not change the governance switch." },
  errGovernanceSave: { "zh-CN": "治理设置保存失败。", "en-US": "Could not save the governance settings." },
  okGovernanceSave: { "zh-CN": "治理设置已保存。", "en-US": "Governance settings saved." },
  errFieldsSave: { "zh-CN": "字段声明保存失败。", "en-US": "Could not save the metadata fields." },
  okFieldsSave: { "zh-CN": "字段声明已保存。", "en-US": "Metadata fields saved." },

  errFolderCreate: { "zh-CN": "目录创建失败。", "en-US": "Could not create the folder." },
  errFolderRename: { "zh-CN": "目录重命名失败。", "en-US": "Could not rename the folder." },
  errFolderDelete: { "zh-CN": "目录删除失败。", "en-US": "Could not delete the folder." },
  /** 删目录的后果。说的是**文档不会丢**——这正是人在按下去之前最想知道的那件事;
   *  只说「不可恢复」会让人以为文档跟着没了。 */
  folderDeleteConsequence: {
    "zh-CN": "目录会被删除,其中的文档不会丢——它们变成「未归档」。",
    "en-US": "The folder goes away. Its documents are not lost - they become unfiled.",
  },
  /** tab 计数里已撤销那一截。缀在活跃数之后,因为它们不是同一种东西。 */
  bindRevokedSuffix: {
    "zh-CN": (n: number) => ` · 已撤销 ${n}`,
    "en-US": (n: number) => ` · ${n} revoked`,
  } satisfies MessageFn<[number]>,
  /** 加载失败,与「正在加载库…」分开。**同一个空态承担两种含义,会让人一直等。** */
  kbLoadFailed: { "zh-CN": "这个库没能打开", "en-US": "Could not open this library" },
  kbLoadFailedHint: {
    "zh-CN": "上面那条说明了原因。重试一次,或返回知识资产。",
    "en-US": "The banner above says why. Retry, or go back to the asset list.",
  },
  // --- 库的五条业务流(LifecycleStrip) ------------------------------------------
  // 每一段只说这个库在那条线上的位置,不重做那个域的事。
  lifeIngest: { "zh-CN": "入库", "en-US": "Ingested" },
  lifeIngestUploadOnly: { "zh-CN": "上传与 API 写入", "en-US": "Uploads and API writes" },
  // --- 抽取:卡尔达在这个库上的产出 ----------------------------------------------
  lifeExtract: { "zh-CN": "抽取", "en-US": "Extraction" },
  /** 主数字是**断言总数**,注解是「其中多少还等着人看」——后者才是要人动手的量。 */
  lifeExtractNote: {
    "zh-CN": (entities: number) => `卡尔达断言 · ${entities} 实体`,
    "en-US": (entities: number) => `Karda assertions · ${entities} entities`,
  } satisfies MessageFn<[number]>,
  lifeExtractPending: {
    "zh-CN": (n: number) => `${n} 待确认`,
    "en-US": (n: number) => `${n} to confirm`,
  } satisfies MessageFn<[number]>,
  /** 一条断言都没有。**不写 0**——「还没抽过」和「抽过但一条没抽到」是两件事,
   *  而这一段只有在从没跑过时才什么都不说。 */
  lifeExtractNone: {
    "zh-CN": "卡尔达还没有在这个库上跑过",
    "en-US": "Karda has not run on this library yet",
  },
  /** 采集库但一个来源都还没接。写「上传与 API 写入」会把一个**声明过真相在源头**
   *  的库描述成自持库，而它真正缺的是一次绑定。 */
  lifeIngestSyncedNone: { "zh-CN": "采集库，尚未接入来源", "en-US": "A synced library with no source connected yet" },
  lifeIngestBindings: {
    "zh-CN": (n: number) => `含 ${n} 个外部来源`,
    "en-US": (n: number) => `incl. ${n} external source${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  lifeProcess: { "zh-CN": "加工", "en-US": "Processed" },
  lifeProcessNote: { "zh-CN": "已可检索", "en-US": "retrievable" },
  lifeParked: {
    "zh-CN": (n: number) => `驻留 ${n}`,
    "en-US": (n: number) => `${n} parked`,
  } satisfies MessageFn<[number]>,
  lifeVerify: { "zh-CN": "验证", "en-US": "Verified" },
  lifeVerifyNote: {
    "zh-CN": (v: number, t: number) => `${v} / ${t} 已验证`,
    "en-US": (v: number, t: number) => `${v} of ${t} verified`,
  } satisfies MessageFn<[number, number]>,
  // 「待复验 N」用既有的 `evaluation.staleCount` —— 我又新加了一份,目录测试当场报重复。
  lifeServe: { "zh-CN": "供给 · 7 日引用", "en-US": "Served · 7-day citations" },
  lifeServeTop: {
    "zh-CN": (who: string) => `常读方 ${who}`,
    "en-US": (who: string) => `top readers ${who}`,
  } satisfies MessageFn<[string]>,
  lifeServeNone: { "zh-CN": "还没有被引用过", "en-US": "Not cited yet" },
  lifeGoDomain: { "zh-CN": "去这条线所属的域", "en-US": "Open the domain that owns this" },

  // --- 向量空间与召回通道(设置里新补的两段) ------------------------------------
  // 补它们是因为**产品在指着不存在的控件说话**:`model_not_routable` 那条驻留写着
  // 「请改库的模型锁」,而设置里此前没有模型锁。
  vectorCardTitle: { "zh-CN": "向量空间", "en-US": "Vector space" },
  vectorUnlocked: {
    "zh-CN": "未锁定——按授权自动路由到当前的嵌入端点。这是推荐状态。",
    "en-US": "Not locked - routed to whichever embedding endpoint is granted. This is the recommended state.",
  },
  vectorLocked: {
    "zh-CN": (model: string) => `已锁定到 ${model}。这个库的内容只与同一模型的向量可比。`,
    "en-US": (model: string) => `Locked to ${model}. This library's vectors are only comparable within that model.`,
  } satisfies MessageFn<[string]>,
  vectorPlaceholder: { "zh-CN": "模型标识(留空 = 不锁定)", "en-US": "Model code (empty = do not lock)" },
  vectorAria: { "zh-CN": "嵌入模型锁", "en-US": "Embedding model lock" },
  vectorHint: {
    "zh-CN": "换一个模型就是换一个向量空间:旧向量与新查询不可比,已入藏的内容要重新加工才回得到检索里。锁一个具体模型是例外,不是默认。",
    "en-US": "Changing the model changes the vector space: old vectors cannot be compared with new queries, and committed content must be reprocessed before it is retrievable again. Locking is the exception, not the default.",
  },
  errVectorSave: { "zh-CN": "向量空间保存失败。", "en-US": "Could not save the vector space." },
  okVectorLocked: {
    "zh-CN": (model: string) => `已锁定到 ${model}。此后加工的内容进入这个向量空间;已入藏的要重新加工才跟上。`,
    "en-US": (model: string) => `Locked to ${model}. Content processed from now on lands in that space; committed content must be reprocessed to follow.`,
  } satisfies MessageFn<[string]>,
  okVectorUnlocked: {
    "zh-CN": "已解除锁定,恢复按授权自动路由。",
    "en-US": "Lock removed; routing follows the grant again.",
  },
  errRetrievalSave: { "zh-CN": "召回通道保存失败。", "en-US": "Could not save the recall channels." },
  okRetrievalSave: { "zh-CN": "召回通道已保存。", "en-US": "Recall channels saved." },
  retrievalCardTitle: { "zh-CN": "召回通道", "en-US": "Recall channels" },
  retrievalCardDesc: {
    "zh-CN": "除向量之外,这个库还走哪几路召回。",
    "en-US": "Which recall paths this library uses besides vectors.",
  },
  retrievalFulltext: { "zh-CN": "全文检索", "en-US": "Full-text search" },
  retrievalFulltextHint: {
    "zh-CN": "关掉之后,尚未向量化的内容完全召不回来。",
    "en-US": "With this off, content that is not vectorised yet cannot be recalled at all.",
  },
  retrievalGraph: { "zh-CN": "图谱召回", "en-US": "Graph recall" },
  retrievalGraphHint: {
    "zh-CN": "按实体与关系扩展召回;这个库没有抽取出实体时开了也不起作用。",
    "en-US": "Expands recall along entities and relations; a library with no extracted entities gains nothing from it.",
  },

  okFolderDelete: {
    "zh-CN": (name: string) => `目录「${name}」已删除，其中的文档变为未归档。`,
    "en-US": (name: string) => `Folder "${name}" deleted; the documents in it are now unfiled.`,
  } satisfies MessageFn<[string]>,

  // --- bindings panel (外部来源) ----------------------------------------------
  bindStateActive: { "zh-CN": "同步中", "en-US": "Syncing" },
  bindStatePaused: { "zh-CN": "已暂停", "en-US": "Paused" },
  bindStateRevoked: { "zh-CN": "已撤销", "en-US": "Revoked" },
  modeBackfill: { "zh-CN": "首次回填", "en-US": "Initial backfill" },
  modeIncremental: { "zh-CN": "增量同步", "en-US": "Incremental sync" },

  bindTitle: { "zh-CN": "接入外部来源", "en-US": "Connect an external source" },
  bindDesc: {
    "zh-CN": "把这个库订阅到一个外部来源。首次绑定从「回填」开始，完成后转入增量同步。",
    "en-US": "Subscribe this library to an external source. A new binding starts with a backfill, then switches to incremental sync.",
  },
  connectorAria: { "zh-CN": "连接器", "en-US": "Connector" },
  connectorPlaceholder: { "zh-CN": "选择连接器…", "en-US": "Choose a connector…" },
  sourceIdPlaceholder: {
    "zh-CN": "来源 id（连接器侧的范围标识）",
    "en-US": "Source id (the scope identifier on the connector's side)",
  },
  sourceIdAria: { "zh-CN": "外部来源 id", "en-US": "External source id" },
  bindButton: { "zh-CN": "绑定", "en-US": "Bind" },
  noConnectors: { "zh-CN": "目前没有可用的连接器。", "en-US": "No connectors are available." },

  capsLabel: { "zh-CN": "能力：", "en-US": "Capabilities:" },
  capChangeSource: { "zh-CN": "来源自检变更", "en-US": "Source detects changes" },
  capChangeKarda: { "zh-CN": "karda 轮询比对", "en-US": "karda polls and diffs" },
  capDeliveryNotify: { "zh-CN": "来源可推送", "en-US": "Source can push" },
  capDeliveryPull: { "zh-CN": "karda 拉取", "en-US": "karda pulls" },
  capFetchDirect: { "zh-CN": "直传字节", "en-US": "Bytes delivered directly" },
  capFetchRef: { "zh-CN": "取引用再拉取", "en-US": "Reference first, then fetch" },
  capReconcileList: { "zh-CN": "可对账", "en-US": "Can reconcile" },
  capReconcileNone: { "zh-CN": "不可对账", "en-US": "Cannot reconcile" },
  capDeleteTombstone: { "zh-CN": "有删除信号", "en-US": "Emits delete signals" },
  capDeleteAbsence: { "zh-CN": "靠缺失推断删除", "en-US": "Infers deletes from absence" },
  deleteInvariantWarning: {
    "zh-CN": "该连接器无法表达删除（不满足 I4）。这是合规缺口，不是使用不便——不要用它接入敏感内容。",
    "en-US": "This connector cannot express deletes (invariant I4 unmet). That is a compliance gap, not an inconvenience - do not bind sensitive content through it.",
  },

  // Degradation wording, keyed by the codes `kb/connectors/catalog.ts` emits.
  degPollLatency: {
    "zh-CN": "karda 轮询该来源；增量延迟以轮询间隔为上限。",
    "en-US": "karda polls this source; incremental latency is bounded by the poll interval.",
  },
  degNoReconcile: {
    "zh-CN": "没有周期对账——长期漂移只能靠整库重载恢复。",
    "en-US": "No periodic reconcile - long-running drift can only be recovered by a full reload.",
  },
  degDeletesByReconcileOnly: {
    "zh-CN": "删除只能靠整表对账发现（I4 的最弱形态）——不适合敏感来源。",
    "en-US": "Deletes are only found by full-list reconcile (I4's weakest form) - unsuitable for sensitive sources.",
  },
  degDeletesUndetectable: {
    "zh-CN": "无法检测删除（只有缺失信号且不能对账）——I4 不满足；不要绑定敏感内容。",
    "en-US": "Deletes CANNOT be detected (absence signal with no reconcile) - I4 is unmet; do not bind sensitive content.",
  },

  bindingsLoading: { "zh-CN": "正在加载绑定…", "en-US": "Loading bindings…" },
  bindingsEmpty: { "zh-CN": "还没有外部来源", "en-US": "No external sources yet" },
  bindingsEmptyDesc: {
    "zh-CN": "这个库的内容全部来自上传或 API 写入。",
    "en-US": "Everything in this library came from an upload or an API write.",
  },
  // Split around the emphasis: the stressed word sits mid-sentence in Chinese
  // and mid-clause in English, and a single string cannot carry the <strong>.
  revokedDescPre: {
    "zh-CN": "保留在这里是因为它们占着的来源标识",
    "en-US": "They stay listed because the source ids they hold ",
  },
  revokedDescStrong: { "zh-CN": "不能", "en-US": "cannot" },
  revokedDescPost: {
    "zh-CN": "再绑定到本库；隐藏它们只会让这条约束在撞上时显得莫名其妙。",
    "en-US": " be bound to this library again; hiding them would only make that constraint baffling when someone hits it.",
  },

  syncedWhen: {
    "zh-CN": (when: string) => `${when} 同步`,
    "en-US": (when: string) => `Synced ${when}`,
  } satisfies MessageFn<[string]>,
  neverSynced: { "zh-CN": "从未同步", "en-US": "Never synced" },
  cursorLabel: {
    "zh-CN": (cursor: string) => `游标 ${cursor}`,
    "en-US": (cursor: string) => `Cursor ${cursor}`,
  } satisfies MessageFn<[string]>,
  actResume: { "zh-CN": "恢复", "en-US": "Resume" },
  actRevoke: { "zh-CN": "撤销", "en-US": "Revoke" },

  // The REVOKE contract. Two consequences, and the second is the severe one an
  // API reader would never guess: uidx_binding_kb_connector_source is unique
  // with no state predicate, so a revoked source can never be bound again.
  revokeConsequence: {
    "zh-CN": (documents: number, verified: number) =>
      `${documents} 份文档退出检索` +
      (verified > 0 ? `，其中 ${verified} 份是已验证内容` : "") +
      "。撤销不可逆：该来源标识不能再绑定回本库。",
    "en-US": (documents: number, verified: number) =>
      `${documents} document${documents === 1 ? "" : "s"} leave retrieval` +
      (verified > 0 ? `, ${verified} of them verified` : "") +
      ". Revoke is irreversible: that source id can never be bound to this library again.",
  } satisfies MessageFn<[number, number]>,
  revokeConsequenceUnknown: {
    "zh-CN": "撤销不可逆：该来源标识不能再绑定回本库。",
    "en-US": "Revoke is irreversible: that source id can never be bound to this library again.",
  },
  revokePrecondition: { "zh-CN": "已算清撤销影响", "en-US": "Revoke impact has been calculated" },
  revokePreconditionNote: {
    "zh-CN": "影响读取失败，请重试后再撤销",
    "en-US": "The impact could not be read - retry before revoking",
  },

  // --- settings: sharing -----------------------------------------------------
  shareCardTitle: { "zh-CN": "共享档位", "en-US": "Sharing grade" },
  shareCardHint: {
    "zh-CN": "自有库可发布到工作区；开放到全组织是管理员操作。",
    "en-US": "You can publish your own library to the workspace; opening it to the whole organization is an admin action.",
  },

  // --- settings: processing template -----------------------------------------
  templateCardTitle: { "zh-CN": "加工模板", "en-US": "Processing template" },
  templateCardDesc: {
    "zh-CN": "决定文件如何被切成可检索的块。切换只影响此后加工的文档，已入库的内容需要重新加工才会跟随。",
    "en-US": "Decides how a file is split into retrievable chunks. A change applies only to documents processed afterwards; content already indexed has to be reprocessed to follow.",
  },
  templateDefault: { "zh-CN": "默认（通用）", "en-US": "Default (general)" },
  templateSpec: {
    "zh-CN": (target: number, max: number) => `目标 ${target} token · 上限 ${max}`,
    "en-US": (target: number, max: number) => `target ${target} tokens · cap ${max}`,
  } satisfies MessageFn<[number, number]>,

  // --- settings: metadata fields ---------------------------------------------
  fieldsCardTitle: { "zh-CN": "业务字段与可筛选白名单", "en-US": "Business fields and the filterable allow-list" },
  fieldsCardDesc: {
    "zh-CN": "字段默认只存储。勾选「可筛选」才会建索引——每个可筛选字段都是一份要付费的索引，所以有上限。",
    "en-US": "A field is stored only, by default. Ticking \"filterable\" builds an index - and every filterable field is an index somebody pays for, which is why there is a cap.",
  },
  fieldsBudget: {
    "zh-CN": (used: number, cap: number) => `可筛选维度 ${used} / ${cap}`,
    "en-US": (used: number, cap: number) => `Filterable dimensions ${used} / ${cap}`,
  } satisfies MessageFn<[number, number]>,
  // The separator is language, not punctuation trivia: Chinese enumerates with
  // a dedicated mark, English with a comma.
  fieldsSystemDims: {
    "zh-CN": (n: number, names: string[]) => ` （含 ${n} 个系统维度：${names.join("、")}）`,
    "en-US": (n: number, names: string[]) => ` (includes ${n} system dimension${n === 1 ? "" : "s"}: ${names.join(", ")})`,
  } satisfies MessageFn<[number, string[]]>,
  fieldsOverCap: { "zh-CN": "超出上限", "en-US": "Over the cap" },
  fieldFilterable: { "zh-CN": "可筛选", "en-US": "Filterable" },
  fieldFilterableAria: {
    "zh-CN": (name: string) => `${name} 可筛选`,
    "en-US": (name: string) => `${name} filterable`,
  } satisfies MessageFn<[string]>,
  fieldRemove: { "zh-CN": "移除", "en-US": "Remove" },
  fieldNamePlaceholder: {
    "zh-CN": "字段名（小写字母开头，可含数字与下划线）",
    "en-US": "Field name (starts with a lower-case letter; digits and underscores allowed)",
  },
  fieldNameAria: { "zh-CN": "新字段名", "en-US": "New field name" },
  fieldTypeAria: { "zh-CN": "字段类型", "en-US": "Field type" },
  // 字段**类型**是一份固定词表,和内容状态一样该说人话——此前中文界面上直接印着
  // `string` / `datetime`。字段**名**不在此列:它是过滤条件里真正要用的键,必须
  // 逐字保留,所以那一列仍然是等宽字体的原文。
  fieldTypeString: { "zh-CN": "文本", "en-US": "Text" },
  fieldTypeNumber: { "zh-CN": "数字", "en-US": "Number" },
  fieldTypeDatetime: { "zh-CN": "日期时间", "en-US": "Date & time" },
  fieldTypeEnum: { "zh-CN": "枚举", "en-US": "Enum" },
  fieldAdd: { "zh-CN": "添加字段", "en-US": "Add field" },
  fieldNameInvalid: {
    "zh-CN": "字段名需以小写字母开头，只含小写字母、数字与下划线。",
    "en-US": "A field name must start with a lower-case letter and contain only lower-case letters, digits and underscores.",
  },
  fieldNameDuplicate: { "zh-CN": "该字段名已存在。", "en-US": "That field name already exists." },
  fieldEnumUnsupported: {
    "zh-CN": "enum 字段的取值集合尚未开放编辑，保存时会被服务端拒绝——先用 string 代替。",
    "en-US": "The value set of an enum field is not editable yet, and the server will refuse the save - use string for now.",
  },
  fieldsSave: { "zh-CN": "保存字段", "en-US": "Save fields" },
  fieldsDiscard: { "zh-CN": "放弃更改", "en-US": "Discard changes" },
  fieldsWholeSetHint: {
    "zh-CN": "保存会整体替换该库的字段声明。",
    "en-US": "Saving replaces this library's whole field declaration.",
  },

  // --- settings: verification governance -------------------------------------
  govOn: {
    "zh-CN": (interval: string) => `已开启。${interval}续验。`,
    "en-US": (interval: string) => `On. Re-verification: ${interval}.`,
  } satisfies MessageFn<[string]>,
  govOff: {
    "zh-CN": "关闭——内容不纳入验证跟踪（默认）。",
    "en-US": "Off - content is not tracked for verification (the default).",
  },
  govSwitchAria: { "zh-CN": "验证治理开关", "en-US": "Verification governance switch" },
  govVerifierLabel: { "zh-CN": "默认验证人（用户 id）", "en-US": "Default verifier (user id)" },
  govVerifierPlaceholder: { "zh-CN": "usr_…（留空则仅管理员）", "en-US": "usr_… (blank means admins only)" },
  govVerifierAria: { "zh-CN": "默认验证人", "en-US": "Default verifier" },
  govIntervalLabel: { "zh-CN": "续验间隔（天）", "en-US": "Re-verification interval (days)" },
  govIntervalPlaceholder: { "zh-CN": "留空 = 只验一次", "en-US": "blank = verify once" },
  govIntervalAria: { "zh-CN": "续验间隔（天）", "en-US": "Re-verification interval in days" },
  govIntervalInvalid: {
    "zh-CN": "间隔需为正整数天数；留空表示只验一次。",
    "en-US": "The interval must be a positive whole number of days; leave it blank to verify once.",
  },
  govExplainer: {
    "zh-CN": "指定的验证人（或管理员）可以验证文档。验证过的文档在间隔到期后转为「过期」，退出默认检索档，直到重新验证。",
    "en-US": "The named verifier (or an admin) can verify documents. A verified document turns stale once the interval elapses and leaves the default retrieval tier until it is verified again.",
  },

  // --- settings: folders -----------------------------------------------------
  foldersCardTitle: { "zh-CN": "目录", "en-US": "Folders" },
  foldersCardDesc: {
    "zh-CN": "库内单层目录，只做整理，不带权限语义（权限在库这一级）。删除目录不会丢文档——它们变成「未归档」。",
    "en-US": "One flat level of folders inside the library, for tidiness only - they carry no permission meaning (permissions live at the library level). Deleting a folder loses no documents; they simply become unfiled.",
  },
  folderRenameAria: {
    "zh-CN": (name: string) => `重命名 ${name}`,
    "en-US": (name: string) => `Rename ${name}`,
  } satisfies MessageFn<[string]>,
  folderNewPlaceholder: { "zh-CN": "新目录名", "en-US": "New folder name" },
  folderCreate: { "zh-CN": "新建目录", "en-US": "New folder" },

  // Universal verbs (save / cancel / close / delete / rename) are NOT here:
  // they live in `common.ts` and every domain reads them from there. A domain
  // that keeps its own 保存 is how two screens end up saying it differently.

  // --- homepage (知识资产 domain root) -----------------------------------------
  // The page TITLE, its description, the bench link and the new-asset button all
  // come from `shell` - they are the domain's own name and entries, and the
  // 导航栏 already owns those words.
  coverageAria: {
    "zh-CN": (pct: number) => `验证覆盖 ${pct}%`,
    "en-US": (pct: number) => `Verification coverage ${pct}%`,
  } satisfies MessageFn<[number]>,
  openAsset: {
    "zh-CN": (name: string) => `打开 ${name}`,
    "en-US": (name: string) => `Open ${name}`,
  } satisfies MessageFn<[string]>,
  cardEntries: {
    "zh-CN": (n: number) => `${n} 条目`,
    "en-US": (n: number) => `${n} entr${n === 1 ? "y" : "ies"}`,
  } satisfies MessageFn<[number]>,
  cardDocs: {
    "zh-CN": (n: number) => `${n} 文档`,
    "en-US": (n: number) => `${n} doc${n === 1 ? "" : "s"}`,
  } satisfies MessageFn<[number]>,
  // Composed on the card when the producer sent only the FIGURE. The seed data
  // still authors a richer sentence per asset; the live path cannot, so it
  // sends `text: null` and the card says it here.
  sourceSelfBuilt: { "zh-CN": "自建", "en-US": "Self-built" },
  sourcePlatform: { "zh-CN": "平台共建", "en-US": "Platform-built" },
  heatLast7d: {
    "zh-CN": (n: number) => `近 7 日被引用 ${n} 次`,
    "en-US": (n: number) => `cited ${n}× in the last 7 days`,
  } satisfies MessageFn<[number]>,
  noOpsYet: { "zh-CN": "尚无运营数据", "en-US": "No operating data yet" },

  agentProcessing: { "zh-CN": "卡尔达加工中", "en-US": "Karda is processing" },
  parkedCount: {
    "zh-CN": (n: number) => `${n} 份停放待向量化`,
    "en-US": (n: number) => `${n} parked, awaiting vectorization`,
  } satisfies MessageFn<[number]>,
  hotConsumers: {
    "zh-CN": (names: string) => `${names} 高频引用`,
    "en-US": (names: string) => `${names} cite it often`,
  } satisfies MessageFn<[string]>,
  heatFallback: { "zh-CN": "引用热度 · 7 日", "en-US": "Citation heat · 7 days" },
  heatTimes: {
    "zh-CN": (n: number) => `${n} 次`,
    "en-US": (n: number) => `${n}×`,
  } satisfies MessageFn<[number]>,

  errLoadOverview: {
    "zh-CN": "加载知识资产失败，请稍后重试。",
    "en-US": "Could not load your knowledge assets. Please retry shortly.",
  },
  needSignIn: { "zh-CN": "需要登录", "en-US": "Sign-in required" },
  needSignInDesc: {
    "zh-CN": "登录后查看工作区的知识资产。",
    "en-US": "Sign in to see this workspace's knowledge assets.",
  },
  loadingOverview: { "zh-CN": "正在加载知识资产…", "en-US": "Loading knowledge assets…" },
  pageMeta: {
    "zh-CN": (a: number, e: string, pct: number) => `${a} 资产 · ${e} 条知识 · 验证覆盖 ${pct}%`,
    "en-US": (a: number, e: string, pct: number) =>
      `${a} asset${a === 1 ? "" : "s"} · ${e} entries · ${pct}% verified`,
  } satisfies MessageFn<[number, string, number]>,
  statsAria: { "zh-CN": "知识资产统计", "en-US": "Knowledge asset statistics" },
  coverageTag: {
    "zh-CN": (v: string, t: string) => `${v} / ${t} 条`,
    "en-US": (v: string, t: string) => `${v} / ${t} entries`,
  } satisfies MessageFn<[string, string]>,
  metricCalls: { "zh-CN": "今日供给调用", "en-US": "Supply calls today" },
  directTag: {
    "zh-CN": (n: number) => `直供 ${n}`,
    "en-US": (n: number) => `Direct ${n}`,
  } satisfies MessageFn<[number]>,
  // No `runosTag`: "Runos 392" is a proper noun and a number, identical in
  // every language. A string with no natural language in it does not belong in
  // a translation catalog - it is built at the call site.
  metricTopAgents: { "zh-CN": "调用 TOP 3 · 今日", "en-US": "Top 3 callers · today" },
  metricAgent: { "zh-CN": "卡尔达 · 今日", "en-US": "Karda · today" },
  agentPendingLink: { "zh-CN": "项待确认 →", "en-US": "awaiting confirmation →" },
  preVerifiedTag: {
    "zh-CN": (n: number) => `预验 ${n}`,
    "en-US": (n: number) => `Pre-verified ${n}`,
  } satisfies MessageFn<[number]>,
  conflictTag: {
    "zh-CN": (n: number) => `冲突 ${n}`,
    "en-US": (n: number) => `Conflicts ${n}`,
  } satisfies MessageFn<[number]>,
  refluxTag: {
    "zh-CN": (n: number) => `回流萃取 ${n}`,
    "en-US": (n: number) => `Reflux drafts ${n}`,
  } satisfies MessageFn<[number]>,
  tagAll: {
    "zh-CN": (n: number) => `全部 ${n}`,
    "en-US": (n: number) => `All ${n}`,
  } satisfies MessageFn<[number]>,
  demoNote: {
    "zh-CN": "调用与引用为演示口径 · 供给账本建设中",
    "en-US": "Call and citation figures are illustrative · the supply ledger is being built",
  },
  emptyFiltered: { "zh-CN": "没有匹配的资产", "en-US": "No assets match" },
  emptyFilteredDesc: {
    "zh-CN": "换一个标签，或清除筛选。",
    "en-US": "Try another tag, or clear the filter.",
  },
} satisfies Catalog;
