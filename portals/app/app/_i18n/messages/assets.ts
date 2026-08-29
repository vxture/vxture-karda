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
  indexLead: {
    "zh-CN": "当前工作区的知识资产。把文档传进某个资产，再决定它共享给谁。",
    "en-US": "The knowledge assets in this workspace. Upload a document into an asset, then decide who it is shared with.",
  },
  indexBenchLink: { "zh-CN": "检验台", "en-US": "The bench" },
  indexBenchTail: {
    "zh-CN": " 可跨你能看到的全部资产试问。",
    "en-US": " can query across every asset you can see.",
  },
  createNameLabel: { "zh-CN": "资产名称", "en-US": "Asset name" },
  createDescLabel: { "zh-CN": "资产描述", "en-US": "Asset description" },
  createDescPlaceholder: { "zh-CN": "描述（可选）", "en-US": "Description (optional)" },
  createPending: { "zh-CN": "创建中…", "en-US": "Creating…" },
  createHint: {
    "zh-CN": "新建的资产默认私有，创建后再决定共享范围。",
    "en-US": "New assets start private; choose the sharing grade after creating.",
  },
  indexLoading: { "zh-CN": "正在加载资产…", "en-US": "Loading assets…" },
  indexEmpty: {
    "zh-CN": "还没有资产。用上面的表单建第一个。",
    "en-US": "No assets yet. Use the form above to create the first one.",
  },
  governedBadge: { "zh-CN": "已开启治理", "en-US": "Governed" },
  integrationStatus: { "zh-CN": "集成状态", "en-US": "Integration status" },

  // --- failures --------------------------------------------------------------
  errLoadList: { "zh-CN": "资产列表加载失败。", "en-US": "Could not load the asset list." },
  errCreate: { "zh-CN": "创建失败。", "en-US": "Could not create the asset." },

  // --- documents panel -------------------------------------------------------
  docUnfiled: { "zh-CN": "未归档", "en-US": "Unfiled" },
  docFilterAria: { "zh-CN": "按目录筛选", "en-US": "Filter by folder" },
  uploadTo: { "zh-CN": "上传至", "en-US": "Upload to" },
  uploadTargetAria: { "zh-CN": "上传目标目录", "en-US": "Upload target folder" },
  uploadPickAria: { "zh-CN": "选择要上传的文档", "en-US": "Choose a document to upload" },
  uploadButton: { "zh-CN": "上传文档", "en-US": "Upload document" },
  uploadHint: {
    // 原文是「索引在嵌入服务可用前保持暂停」——一句**常驻的**停摆说明,挂在上传框
    // 旁边,不论此刻加工是不是真的卡住。真卡住时说什么,由每一份文档自己那行
    // 「加工暂停:…」负责(`states.blocker*`),那一行知道是哪一档、去哪补。
    "zh-CN": "文件入库即排队加工;卡住时会在该文档下说明原因。",
    "en-US": "A file is queued for processing the moment it lands; if anything blocks it, the reason is stated under that document.",
  },
  /** 分布图里把长尾并起来的那一条。带数量,因为「其余」不说几个等于没说。 */
  restAssets: {
    "zh-CN": (n: number) => `其余 ${n} 个资产`,
    "en-US": (n: number) => `${n} more assets`,
  },
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
  tabDocuments: { "zh-CN": "文档", "en-US": "Documents" },
  tabBindings: { "zh-CN": "外部来源", "en-US": "External sources" },
  tabSettings: { "zh-CN": "设置", "en-US": "Settings" },

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
