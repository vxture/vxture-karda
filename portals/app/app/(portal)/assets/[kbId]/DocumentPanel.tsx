"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActionMenu,
  Button,
  DataTable,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  FilterBar,
  Icon,
  Input,
  ListCard,
  ListCardGrid,
  NativeSelect,
  Pagination,
  SegmentedControl,
  TableTitleCell,
  useListPagination,
  type ActionMenuItem,
  type DataTableColumn,
  type DataTableSort,
  type FilterBarView,
} from "@vxture/design-system";
import { documentBytesHref, type Doc, type Folder, type Kb, type ParkedByDocument } from "../../../_lib/api";
import { formatBytes } from "../../../_lib/format";
import { useFormat } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { common } from "../../../_i18n/messages/common";
import { assets } from "../../../_i18n/messages/assets";
import { states } from "../../../_i18n/messages/states";
import type { Unavailable, UnavailableCause } from "../../../kb/processing/unavailable";
import { previewKind } from "../../../kb/lib/preview";
import { verificationRecord } from "../../../kb/governance/record";
// `Badge` here is the local tone wrapper (_lib/ui), which maps our five-tone
// vocabulary onto the DS scale - not the DS Badge, which takes a variant.
import { Badge as ToneBadge } from "../../../_lib/ui";

// The documents half of a library. Batch 10 turned this from a list you could
// only add to and delete from into the surface a library owner actually works
// on: file into folders, read a document in place, see WHY one failed, and
// re-run it once the cause is fixed.
//
// **这是一张表,所以它用 DS 的表**(owner 2026-08-30)。
//
// 在此之前它是一堆用 flex 摆出来的「看起来像表」的行,而那意味着四件东西各自缺席:
//
//   · 没有表头 —— 那四列没有名字,读的人得自己猜第二列是什么;
//   · 没有排序控件 —— 于是排序只能另放一个下拉,占掉工具行一格;
//   · 没有分页 —— 于是手写了一个「显示更多」;
//   · 没有列表/卡片切换 —— 而那是本仓清单页工具行的常备段(DS `FilterBar` 拍板
//     2026-08-03)。
//
// 四件 DS 里都有:`DataTable`(表头 + 可排序表头 + 骨架行 + 空态槽 + 表尾槽)、
// `Pagination` + `useListPagination`、`ViewModeSwitch`(经 `FilterBar` 的 view 段)、
// `ListCard` + `ListCardGrid`。自己搭的那一套既少功能,又与别的清单页长得不一样——
// 而「各页自己拼」正是 DS 立这些件要解决的问题。
//
// FAILURES LEAD. 失败的文档**排在最前**,不参与排序也不被分页推到第二页:它是这一页
// 上唯一等着人动手的东西。此前它是单独一张卡钉在表上方;现在钉在同一张表的头部,
// 因为两张表意味着两行表头,而那读起来像两份清单。

const RECORD_TONE = {
  none: "",
  ok: "text-muted-foreground",
  soon: "text-warning-text",
  lapsed: "text-destructive-text",
} as const;

type FolderFilter = string; // folder id, "" = all, UNFILED for null

const UNFILED = "\u0000unfiled";

/** 视图偏好是**这个浏览器的**小习惯,不是库的属性——所以落 localStorage,不落库。
 *  与外壳那几个键同一个前缀。读写都包 try/catch:隐私窗口里 localStorage 会直接抛。 */
const VIEW_KEY = "karda-doc-view";

/**
 * 每页多少行。
 *
 * 分页仍然在**客户端**(KD-219 的裁定不变,理由也不变:目录芯片的计数、失败组、
 * 「本地补充」的判断、页头那条状态条全都要读整份清单才算得出来)。变的只是**控件**:
 * 手写的「显示更多」换成 DS 的 `Pagination` + `useListPagination`,顺带拿到了每页
 * 条数选择和跨页序号。
 */
const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function DocumentPanel({
  kb,
  docs,
  parked,
  folders,
  busy,
  onUpload,
  onVerify,
  onRetry,
  onDelete,
}: {
  kb: Kb;
  docs: Doc[] | null;
  /** 每份**驻留中**文档卡在什么原因上,按 document_id 索引。与文档清单同一趟取回,
   *  但不长在文档行上——文档没有驻留,是它的任务驻留了。 */
  parked: ParkedByDocument;
  folders: Folder[];
  busy: boolean;
  onUpload: (file: File, folderId: string | null) => void | Promise<void>;
  onVerify: (doc: Doc) => void | Promise<void>;
  onRetry: (doc: Doc) => void | Promise<void>;
  onDelete: (doc: Doc) => void | Promise<void>;
}) {
  const f = useFormat();
  const m = useMessages(assets);
  const c = useMessages(common);
  const [filter, setFilter] = useState<FolderFilter>("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DataTableSort>({ columnId: "updated", direction: "desc" });
  const [view, setView] = useState<FilterBarView>("list");
  const [preview, setPreview] = useState<Doc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 视图偏好在挂载后才读:直接在 useState 初值里读 localStorage 会让服务端渲染出的
  // HTML 与客户端第一帧不一致,React 报水合失配。
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      if (v === "list" || v === "cards") setView(v);
    } catch {
      // 隐私窗口 / 站点数据被禁:保持默认的列表档,不打扰。
    }
  }, []);
  const changeView = (v: FilterBarView) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      // 同上:存不下就只是这一次不记得,功能不受影响。
    }
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of docs ?? []) {
      const key = d.folderId ?? UNFILED;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [docs]);

  const shown = useMemo(() => {
    if (!docs) return null;
    const byFolder =
      filter === ""
        ? docs
        : filter === UNFILED
          ? docs.filter((d) => d.folderId === null)
          : docs.filter((d) => d.folderId === filter);
    // 大小写不敏感的子串匹配。**不做分词、不做模糊**:这一格回答的是「我知道它叫
    // 什么,把它找出来」,而「我不知道该找什么」是检索台(`/bench`)的问题,那里有
    // 真正的召回。在这里塞一个半吊子的相似匹配,只会让人以为搜过了。
    const q = query.trim().toLowerCase();
    const matched = q === "" ? byFolder : byFolder.filter((d) => d.title.toLowerCase().includes(q));

    // 排序前先复制:`docs` 是上层的 state,原地 sort 会改到它。
    const sorted = [...matched];
    const dir = sort.direction === "asc" ? 1 : -1;
    if (sort.columnId === "title") {
      // `localeCompare` 而不是 `<`:中文标题按 UTF-16 码点排是笔画和拼音都不沾边的
      // 顺序,而这一页的标题绝大多数是中文。
      sorted.sort((a, b) => dir * a.title.localeCompare(b.title));
    } else if (sort.columnId === "size") {
      sorted.sort((a, b) => dir * ((a.sizeBytes ?? 0) - (b.sizeBytes ?? 0)));
    } else {
      sorted.sort((a, b) => dir * (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)));
    }

    // 失败的钉在最前,**不参与排序**。一个按时间排的清单会把唯一要人动手的那几份
    // 埋在一堆已经好好的文档里。
    return [
      ...sorted.filter((d) => d.contentState === "failed"),
      ...sorted.filter((d) => d.contentState !== "failed"),
    ];
  }, [docs, filter, query, sort]);

  const failedCount = (shown ?? []).filter((d) => d.contentState === "failed").length;

  const { page, pageCount, pageSize, pageRows, onPageChange, onPageSizeChange, resetPage } =
    useListPagination<Doc>(shown ?? [], PAGE_SIZE);

  // 筛选/搜索/排序一变就回第一页:第七页是**对上一份清单**说的,换了清单还停在
  // 第七页,人看到的会是一片空白。
  useEffect(() => {
    resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetPage 每次渲染都是新函数,挂进依赖会每帧重置
  }, [filter, query, sort]);

  // 上传落到**当前筛选的那个目录**,而不是一个独立的「上传至」下拉。
  //
  // 那个下拉和目录芯片说的是同一件事——「哪个目录」——于是同一个问题在一行里被问了
  // 两遍,还能被答成两个不同的答案(筛在「投标 2026」,却传进了「未归档」)。
  //
  // 「全部」和「未归档」都落到未归档:前者不是一个目录,没有「传到全部」这回事。
  const uploadTarget = filter === "" || filter === UNFILED ? null : filter;
  const uploadFolderName = folders.find((x) => x.id === uploadTarget)?.name ?? null;

  // 采集库里手工放进来的内容。解释在**面板顶上说一次**,不挂在每一行:一行一个
  // 提示既重复又都看不见,而这句话要回答的问题只会被问一次——「为什么这一份要
  // 复验,旁边同一个库里的那些不用」。
  const hasLocalAdditions =
    kb.sourceMode === "synced" && (docs ?? []).some((d) => d.source !== "connector");

  // Only offer folders that exist. An empty catalogue means the filter row is
  // noise, not an empty control.
  const filterItems = [
    { value: "", label: c.all, count: docs?.length ?? 0 },
    ...folders.map((x) => ({ value: x.id, label: x.name, count: counts.get(x.id) ?? 0 })),
    ...(counts.get(UNFILED) ? [{ value: UNFILED, label: m.docUnfiled, count: counts.get(UNFILED) ?? 0 }] : []),
  ];

  const searching = query.trim() !== "";
  /** 三种空,三句话。搜不到**不是**这个库是空的:后者要引导上传,前者要给一条退路
   *  (清空搜索),而用同一句「还没有文档」会让人以为文件丢了。 */
  const empty = searching ? (
    <EmptyState
      title={m.docNoMatch}
      description={m.docNoMatchHint}
      action={<Button variant="outline" onClick={() => setQuery("")}>{m.docClearSearch}</Button>}
    />
  ) : (
    <EmptyState
      title={filter === "" ? m.docEmpty : m.docEmptyFolder}
      description={filter === "" ? m.docEmptyHint : undefined}
    />
  );

  const actions = (doc: Doc): ActionMenuItem[] => {
    const readable = previewKind(doc.mime) !== "none";
    const gov = kb.governanceEnabled;
    return [
      // 只有真会渲染的才给「预览」。一个点下去变成下载的「预览」是失约,不是回退。
      readable
        ? { id: "preview", label: m.actPreview, icon: "eye" as const, onSelect: () => setPreview(doc) }
        : {
            id: "download",
            label: m.actDownload,
            icon: "download" as const,
            onSelect: () => window.open(documentBytesHref(kb.id, doc.id), "_blank", "noopener"),
          },
      ...(doc.contentState === "failed"
        ? [{ id: "retry", label: m.actReprocess, icon: "refresh" as const, disabled: busy, onSelect: () => void onRetry(doc) }]
        : []),
      ...(gov && doc.contentState !== "failed"
        ? [
            {
              id: "verify",
              label: doc.verificationState === "verified" ? m.actReverify : m.actVerify,
              icon: "check" as const,
              disabled: busy,
              onSelect: () => void onVerify(doc),
            },
          ]
        : []),
      {
        id: "delete",
        label: c.delete,
        icon: "trash" as const,
        danger: true,
        separatorBefore: true,
        confirm: {
          verb: c.delete,
          target: doc.title,
          // `deleted` is terminal in the content state machine - there is no
          // transition back out of it.
          consequence: m.deleteConsequence,
          onConfirm: () => Promise.resolve(onDelete(doc)),
        },
      },
    ];
  };

  const statusOf = (doc: Doc) => {
    const cs = f.content(doc.contentState);
    const vr = f.verification(doc.verificationState);
    const localAddition = kb.sourceMode === "synced" && doc.source !== "connector";
    return (
      <span className="flex flex-wrap items-center justify-center gap-xs">
        {/* 采集库里手工放进来的那一份。它不是错误,但它和周围那些同步来的不是一回事:
            源头不会更新它,而治理**照常**适用(`governanceApplies` 按每份文档的
            `synced` 判断)。 */}
        {localAddition && <ToneBadge tone="info">{m.docLocalAdd}</ToneBadge>}
        {kb.governanceEnabled && <ToneBadge tone={vr.tone}>{vr.label}</ToneBadge>}
        <ToneBadge tone={cs.tone}>{cs.label}</ToneBadge>
      </span>
    );
  };

  const columns: DataTableColumn<Doc>[] = [
    {
      id: "title",
      header: m.docSortTitle,
      sortable: true,
      // `description` 放来源:它说的是「谁把它放进来的」,而这决定了断源之后它还在
      // 不在、治理管不管它。此前这里印的是 `doc.source` 的机器值。
      cell: (doc) => (
        <TableTitleCell
          title={doc.title}
          description={f.docSource(doc.source)}
          tooltip={doc.title}
          onTitleClick={previewKind(doc.mime) !== "none" ? () => setPreview(doc) : undefined}
        />
      ),
    },
    { id: "status", header: m.docColStatus, align: "center", width: "md", cell: statusOf },
    {
      id: "updated",
      header: m.docColUpdated,
      sortable: true,
      width: "sm",
      cell: (doc) => <span className="tabular-nums">{f.when(doc.updatedAt)}</span>,
    },
    {
      id: "size",
      header: m.docColSize,
      align: "right",
      width: "xs",
      sortable: true,
      cell: (doc) => <span className="tabular-nums">{formatBytes(doc.sizeBytes)}</span>,
    },
  ];

  // 展开区:失败原因、驻留说明、验证时钟。**默认全部展开**——它们不是「想看再看」的
  // 细节,而是「这一份为什么没好」的答案;藏进折叠里等于把要办的事藏起来。折叠键仍然
  // 受控,所以人可以自己收起来。
  const detailKeys = (shown ?? []).filter((d) => hasDetail(d, parked[d.id] ?? null, kb)).map((d) => d.id);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const expandedKeys = detailKeys.filter((id) => !collapsed.includes(id));

  return (
    <div className="flex flex-col gap-md">
      {hasLocalAdditions && (
        <p className="text-body-sm text-muted-foreground">{m.docLocalAddHint}</p>
      )}

      {/* 工具行是 DS 的件,不是自己摆的一行。右段顺序(搜索 / 重置 / 筛选组 / 操作)
          是 `FilterBar` 的契约:此前二十二个清单页各排各的顺序,那条契约就是为此立的。
          目录芯片走 `scope` 段而不是 `children`——切面是「换一份数据」,筛选是「在同
          一份数据里少看几行」,混进右段的下拉串里,换轴的控件会读成又一个筛选条件。 */}
      <FilterBar
        view={view}
        onViewChange={changeView}
        count={docs ? m.metaDocs(docs.length) : undefined}
        scope={
          filterItems.length > 1 ? (
            <SegmentedControl
              items={filterItems}
              value={filter}
              onChange={setFilter}
              size="sm"
              ariaLabel={m.docFilterAria}
            />
          ) : undefined
        }
        search={
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={m.docSearchPlaceholder}
            aria-label={m.docSearchAria}
            className="w-[16rem] max-w-full"
          />
        }
        onReset={searching || filter !== "" ? () => { setQuery(""); setFilter(""); } : undefined}
        resetLabel={m.docClearSearch}
        actions={
          <>
            <input
              ref={fileRef}
              type="file"
              className="hidden"
              aria-label={m.uploadPickAria}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                // Reset BEFORE awaiting: re-picking the SAME file is the normal
                // gesture after a failed upload, and an input still holding that
                // file fires no change event the second time.
                if (fileRef.current) fileRef.current.value = "";
                if (file) await onUpload(file, uploadTarget);
              }}
            />
            {/* 按钮自己说它会落在哪儿。在「全部」或「未归档」下它只是「上传文档」——
                那时没有第二种可能,写出来是废话。 */}
            <Button variant="default" disabled={busy} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />
              {uploadFolderName ? m.uploadToFolder(uploadFolderName) : m.uploadButton}
            </Button>
          </>
        }
      >
        {/* 卡片档没有表头,排序就没有别的落点;列表档的排序控件**是表头本身**,所以
            这个下拉只在卡片档出现——同一个状态两个控件,正是上面刚拆掉的那种重复。 */}
        {view === "cards" && (
          <NativeSelect
            value={`${sort.columnId}:${sort.direction}`}
            onChange={(e) => {
              const [columnId, direction] = e.target.value.split(":");
              setSort({ columnId, direction: direction as DataTableSort["direction"] });
            }}
            aria-label={m.docSortAria}
            wrapperClassName="w-[9rem]"
          >
            <option value="updated:desc">{m.docSortRecent}</option>
            <option value="updated:asc">{m.docSortOldest}</option>
            <option value="title:asc">{m.docSortTitle}</option>
          </NativeSelect>
        )}
      </FilterBar>

      {failedCount > 0 && (
        <div className="flex items-center gap-sm">
          <Icon name="warning" className="text-destructive" />
          <span className="text-title-sm">{m.failedCount(failedCount)}</span>
          <span className="text-body-sm text-muted-foreground">{m.failedHint}</span>
        </div>
      )}

      {view === "cards" ? (
        <>
          {shown === null ? (
            <EmptyState title={m.docLoading} />
          ) : shown.length === 0 ? (
            empty
          ) : (
            <ListCardGrid>
              {pageRows.map((doc) => (
                <ListCard
                  key={doc.id}
                  title={doc.title}
                  description={`${f.when(doc.updatedAt)} · ${formatBytes(doc.sizeBytes)} · ${f.docSource(doc.source)}`}
                  status={statusOf(doc)}
                  actions={<ActionMenu items={actions(doc)} label={m.docColActions} />}
                  meta={<DocumentDetail kb={kb} doc={doc} parked={parked[doc.id] ?? null} />}
                />
              ))}
            </ListCardGrid>
          )}
          {shown !== null && shown.length > 0 && (
            <Pagination
              page={page}
              pageCount={pageCount}
              total={docs?.length ?? 0}
              filteredTotal={shown.length}
              pageSize={pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
              previousLabel={c.pagerPrev}
              nextLabel={c.pagerNext}
              pageSizeLabel={c.pagerSizeLabel}
              pageSizeOptionTemplate={c.pagerSizeTemplate}
              countLabel={
                shown.length === (docs?.length ?? 0)
                  ? m.docPageCount(shown.length)
                  : m.docPageCountFiltered(shown.length, docs?.length ?? 0)
              }
            />
          )}
        </>
      ) : (
        <DataTable<Doc>
          columns={columns}
          rows={pageRows}
          rowKey={(doc) => doc.id}
          loading={shown === null}
          loadingRows={8}
          empty={empty}
          sort={sort}
          onSortChange={setSort}
          rowActions={(doc) => <ActionMenu items={actions(doc)} label={m.docColActions} />}
          labels={{ rowActions: m.docColActions, expand: c.expand }}
          expandedContent={(doc) =>
            hasDetail(doc, parked[doc.id] ?? null, kb) ? (
              <DocumentDetail kb={kb} doc={doc} parked={parked[doc.id] ?? null} />
            ) : null
          }
          expandedKeys={expandedKeys}
          onExpandedChange={(keys) =>
            setCollapsed(detailKeys.filter((id) => !keys.includes(id)))
          }
          footer={
            shown !== null && shown.length > 0 ? (
              <Pagination
                page={page}
                pageCount={pageCount}
                total={docs?.length ?? 0}
                filteredTotal={shown.length}
                pageSize={pageSize}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
                onPageChange={onPageChange}
                onPageSizeChange={onPageSizeChange}
                previousLabel={c.pagerPrev}
                nextLabel={c.pagerNext}
                pageSizeLabel={c.pagerSizeLabel}
                pageSizeOptionTemplate={c.pagerSizeTemplate}
                countLabel={
                  shown.length === (docs?.length ?? 0)
                    ? m.docPageCount(shown.length)
                    : m.docPageCountFiltered(shown.length, docs?.length ?? 0)
                }
              />
            ) : undefined
          }
        />
      )}

      <PreviewDialog kb={kb} doc={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

/** 与首页同一张表(`home-client.tsx`),句子在共享的状态目录里,只有这份键映射各写
 *  一次——把它也提到公共模块只是为了省四行,却让两个页面耦合在一个别处的常量上。 */
const BLOCKER_KEY = {
  atlas_not_configured: "blockerAtlasNotConfigured",
  workspace_not_provisioned: "blockerWorkspaceNotProvisioned",
  endpoint_not_granted: "blockerEndpointNotGranted",
  model_not_routable: "blockerModelNotRoutable",
} as const satisfies Record<UnavailableCause, keyof typeof states>;

/** 这一份有没有话要说。空的展开区比没有展开区更糟:箭头在,点开是空的。 */
function hasDetail(doc: Doc, parked: Unavailable | null, kb: Kb): boolean {
  if (parked) return true;
  if (doc.contentState === "failed" && doc.failureReason) return true;
  if (doc.contentState === "processing") return true;
  if (kb.governanceEnabled && doc.verifiedAt) return true;
  return false;
}

/** 一份文档在表格行之下要交代的事:为什么没好、卡在哪、上次谁验的。 */
function DocumentDetail({ kb, doc, parked }: { kb: Kb; doc: Doc; parked: Unavailable | null }) {
  const f = useFormat();
  const m = useMessages(assets);
  const st = useMessages(states);
  const hint = f.processingHint(doc.contentState);
  const record = verificationRecord(doc.verificationState, doc.verifiedAt, doc.expiresAt, new Date());

  return (
    <div className="flex flex-col gap-2xs">
      {doc.contentState === "failed" && doc.failureReason && (
        <div className="font-mono text-code-sm text-destructive">{doc.failureReason}</div>
      )}
      {kb.governanceEnabled && record.phrase && (
        // The verification RECORD, not a history: these columns hold exactly one
        // verification (each verify overwrites them), so what is shown is the
        // current one with its CLOCK made legible. "还有 6 天到期" is the part an
        // operator acts on; "2026-05-03 验证" is not.
        <div className="flex flex-wrap items-center gap-sm text-body-sm text-muted-foreground">
          <span className={RECORD_TONE[record.urgency]}>{f.record(record)}</span>
          {doc.verifiedAt && (
            <>
              <span>·</span>
              <span>
                {m.verifiedWhen(f.when(doc.verifiedAt))}
                {doc.verifier ? ` · ${m.verifiedBy(doc.verifier)}` : ""}
              </span>
            </>
          )}
        </div>
      )}
      {/* 卡住的文档自己说卡在哪、去哪补。
          没驻留时才回落到那句中性的「已收下并入队」——原先那句写的是「向量服务恢复前
          索引暂停」,给每一份 processing 文档都挂上一句停摆说明,包括排着队加工得好好
          的那些,而且把「没授权」说成一次会自己过去的故障。 */}
      {parked ? (
        <div className="flex flex-col gap-3xs text-body-sm">
          <span>
            <span className="text-warning-text">{st.parkedPrefix}</span>
            {parked.arg ? <code className="ml-2xs font-mono text-code-sm text-foreground">{parked.arg}</code> : null}
            <span className="ml-2xs text-muted-foreground">{st[BLOCKER_KEY[parked.cause]]}</span>
          </span>
          <span className="text-muted-foreground">{st.blockerResumeNote}</span>
        </div>
      ) : (
        hint && <div className="text-body-sm text-muted-foreground">{hint}</div>
      )}
    </div>
  );
}

/** Reads the stored bytes in place. The frame is sandboxed and same-origin is
 *  NOT granted: the content is user-uploaded, and the server already refuses to
 *  serve inline anything that executes, so this is the second of two locks
 *  rather than the only one. */
function PreviewDialog({ kb, doc, onClose }: { kb: Kb; doc: Doc | null; onClose: () => void }) {
  const m = useMessages(assets);
  const c = useMessages(common);
  const kind = previewKind(doc?.mime);
  const href = doc ? documentBytesHref(kb.id, doc.id, true) : "";

  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[64rem]">
        <DialogHeader>
          {/* `leading-[1]` overrides DS DialogTitle's own `leading-none`, which
              resolves to line-height:0 here - Tailwind v4 falls back to the
              --spacing-* scale for `leading-*` and DS registers
              --spacing-none: 0px, so the title renders at zero height and
              simply is not there. Reported to DS; remove when their build no
              longer ships `leading-none`. */}
          <DialogTitle className="truncate leading-[1]">{doc?.title ?? ""}</DialogTitle>
          <DialogDescription>
            {doc ? `${doc.mime ?? m.unknownMime} · ${formatBytes(doc.sizeBytes)}` : ""}
          </DialogDescription>
        </DialogHeader>

        {doc && (
          <div className="h-[70vh] overflow-auto rounded-md border border-border bg-muted/30">
            {kind === "image" ? (
              // An <img>, not a frame: a frame around an image inherits the
              // browser's centred-on-grey viewer chrome, which reads as a broken
              // page inside a dialog.
              <img src={href} alt={doc.title} className="mx-auto max-w-full" />
            ) : (
              <iframe
                src={href}
                title={doc.title}
                className="h-full w-full border-0"
                sandbox=""
              />
            )}
          </div>
        )}

        <div className="flex justify-end gap-sm">
          {doc && (
            <Button asChild>
              <a href={documentBytesHref(kb.id, doc.id)}>{m.downloadOriginal}</a>
            </Button>
          )}
          <Button variant="default" onClick={onClose}>
            {c.close}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
