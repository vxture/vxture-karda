"use client";

import { useMemo, useRef, useState } from "react";
import {
  Button,
  Input,
  DestructiveButton,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Icon,
  NativeSelect,
  SegmentedControl,
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
// FAILURES LEAD. The failed group is pinned above the list rather than sorted
// into it, because a failed document is the only row on this page that is
// waiting on a person. A list ordered purely by time buries the one thing that
// needs doing under everything that is already fine.

const RECORD_TONE = {
  none: "",
  ok: "text-muted-foreground",
  soon: "text-warning-text",
  lapsed: "text-destructive-text",
} as const;

type FolderFilter = string; // folder id, "" = all, UNFILED for null

const UNFILED = "\u0000unfiled";

/** 排序口径。三个,不是六个:**每一个都要能一句话说清它回答什么问题**,而
 *  「按状态」「按大小」在这一页上没有对应的问题——失败的那些已经被钉在最上面了。 */
type Sort = "recent" | "oldest" | "title";

/**
 * 一次先画多少行。
 *
 * 这一页此前把全部文档一次铺完:演示库里是 94 到 412 行,真实库只会更长。分页放在
 * **客户端**而不是服务端,是一个有理由的选择:这一页上另外几样东西——目录芯片上的
 * 计数、钉在最上面的失败组、「本地补充」的判断、还有页头那条状态条——全都要读**整
 * 份**清单才算得出来。改成服务端分页就必须另开一套聚合端点,于是同一个数字有了两个
 * 来源,而这一页本轮修的 bug 里有一半正是「两个数字互相拆台」。
 *
 * 服务端分页要到「取回清单本身就太贵」的量级才成为必需,那时它连同计数端点一起做,
 * 是另一件事。
 */
const PAGE = 50;

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
  const m = useMessages(assets);
  const c = useMessages(common);
  const [filter, setFilter] = useState<FolderFilter>("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  /** 已经展开到第几批。任何一次筛选/搜索/排序变化都把它收回第一批——展开是对
   *  **当前这份清单**的操作,换了清单还留着「已展开 200 行」是无意义的继承。 */
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<string>("");
  const [preview, setPreview] = useState<Doc | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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
    if (sort === "title") {
      // `localeCompare` 而不是 `<`:中文标题按 UTF-16 码点排是笔画和拼音都不沾边的
      // 顺序,而这一页的标题绝大多数是中文。
      sorted.sort((a, b) => a.title.localeCompare(b.title));
    } else {
      const dir = sort === "oldest" ? 1 : -1;
      sorted.sort((a, b) => dir * (Date.parse(a.updatedAt) - Date.parse(b.updatedAt)));
    }
    return sorted;
  }, [docs, filter, query, sort]);

  const failed = (shown ?? []).filter((d) => d.contentState === "failed");
  const restAll = (shown ?? []).filter((d) => d.contentState !== "failed");
  // 失败组**不参与分批**:它是这一页上唯一等着人动手的东西,把它折进「显示更多」
  // 里等于把要办的事藏起来。分批只管下面那一长串已经好好的文档。
  const rest = restAll.slice(0, page * PAGE);
  const more = restAll.length - rest.length;

  // 采集库里手工放进来的内容。解释在**面板顶上说一次**,不挂在每一行:一行一个
  // 提示既重复又都看不见,而这句话要回答的问题只会被问一次——「为什么这一份要
  // 复验,旁边同一个库里的那些不用」。
  const hasLocalAdditions =
    kb.sourceMode === "synced" && (docs ?? []).some((d) => d.source !== "connector");

  // Only offer folders that exist. An empty catalogue means the filter row is
  // noise, not an empty control.
  const filterItems = [
    { value: "", label: c.all, count: docs?.length ?? 0 },
    ...folders.map((f) => ({ value: f.id, label: f.name, count: counts.get(f.id) ?? 0 })),
    ...(counts.get(UNFILED) ? [{ value: UNFILED, label: m.docUnfiled, count: counts.get(UNFILED) ?? 0 }] : []),
  ];

  return (
    <div className="flex flex-col gap-md">
      {hasLocalAdditions && (
        <p className="text-body-sm text-muted-foreground">{m.docLocalAddHint}</p>
      )}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-md py-md">
          <label className="flex items-center gap-sm text-body-md">
            <span className="text-muted-foreground">{m.uploadTo}</span>
            <NativeSelect
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              aria-label={m.uploadTargetAria}
              // Width goes on the WRAPPER, not the select: DS anchors the arrow
              // to the wrapper's right edge, so narrowing only the select
              // strands the arrow at the far right.
              wrapperClassName="w-[10rem]"
              disabled={busy}
            >
              <option value="">{m.docUnfiled}</option>
              {folders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </NativeSelect>
          </label>

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
              if (file) await onUpload(file, target || null);
            }}
          />
          <Button variant="default" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" />
            {m.uploadButton}
          </Button>

          <span className="ml-auto text-body-sm text-muted-foreground">
            {m.uploadHint}
          </span>
        </CardContent>
      </Card>

      {/* 目录芯片、搜索、排序在同一行:它们是同一件事的三个把手——「让这份清单只剩
          我要看的那些」。分成两行会让人以为搜索是对目录筛选之后的结果再筛一次,而
          那恰好是真的,但读起来像两套。 */}
      <div className="flex flex-wrap items-center gap-sm">
        {filterItems.length > 1 && (
          <SegmentedControl items={filterItems} value={filter} onChange={(v) => { setFilter(v); setPage(1); }} size="sm" ariaLabel={m.docFilterAria} />
        )}
        <div className="ml-auto flex items-center gap-sm">
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={m.docSearchPlaceholder}
            aria-label={m.docSearchAria}
            className="w-[16rem] max-w-full"
          />
          <NativeSelect
            value={sort}
            onChange={(e) => {
              setSort(e.target.value as Sort);
              setPage(1);
            }}
            aria-label={m.docSortAria}
            wrapperClassName="w-[9rem]"
          >
            <option value="recent">{m.docSortRecent}</option>
            <option value="oldest">{m.docSortOldest}</option>
            <option value="title">{m.docSortTitle}</option>
          </NativeSelect>
        </div>
      </div>

      {shown === null ? (
        <EmptyState title={m.docLoading} />
      ) : shown.length === 0 ? (
        // 三种空,三句话。搜不到**不是**这个库是空的:后者要引导上传,前者要给一条
        // 退路(清空搜索),而用同一句「还没有文档」会让人以为文件丢了。
        query.trim() !== "" ? (
          <EmptyState
            title={m.docNoMatch}
            description={m.docNoMatchHint}
            action={
              <Button variant="outline" onClick={() => { setQuery(""); setPage(1); }}>
                {m.docClearSearch}
              </Button>
            }
          />
        ) : (
          <EmptyState
            title={filter === "" ? m.docEmpty : m.docEmptyFolder}
            description={filter === "" ? m.docEmptyHint : undefined}
          />
        )
      ) : (
        <div className="flex flex-col gap-md">
          {failed.length > 0 && (
            <Card className="border-destructive/25">
              <CardContent className="flex flex-col gap-sm py-md">
                <div className="flex items-center gap-sm">
                  <Icon name="warning" className="text-destructive" />
                  <span className="text-title-sm">{m.failedCount(failed.length)}</span>
                  <span className="text-body-sm text-muted-foreground">
                    {m.failedHint}
                  </span>
                </div>
                {failed.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    kb={kb}
                    doc={doc}
                    parked={parked[doc.id] ?? null}
                    busy={busy}
                    onPreview={setPreview}
                    onVerify={onVerify}
                    onRetry={onRetry}
                    onDelete={onDelete}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {restAll.length > 0 && (
            <Card>
              <CardContent className="flex flex-col py-sm">
                {rest.map((doc) => (
                  <DocumentRow
                    key={doc.id}
                    kb={kb}
                    doc={doc}
                    parked={parked[doc.id] ?? null}
                    busy={busy}
                    onPreview={setPreview}
                    onVerify={onVerify}
                    onRetry={onRetry}
                    onDelete={onDelete}
                  />
                ))}
                {/* 「还剩多少」必须写出来:只画一个「显示更多」而不说剩几份,读的人
                    没法判断这是「还有两份」还是「还有三百份」,而这两种情况下他会
                    做的事不一样(一个是继续翻,一个是改去搜)。 */}
                {more > 0 && (
                  <div className="flex items-center gap-sm border-t border-border/60 pt-sm">
                    <Button variant="outline" size="sm" onClick={() => setPage((n) => n + 1)}>
                      {m.docShowMore(more)}
                    </Button>
                    <span className="text-body-sm text-muted-foreground">
                      {m.docShownOf(rest.length, restAll.length)}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
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

function DocumentRow({
  kb,
  doc,
  parked,
  busy,
  onPreview,
  onVerify,
  onRetry,
  onDelete,
}: {
  kb: Kb;
  doc: Doc;
  parked: Unavailable | null;
  busy: boolean;
  onPreview: (doc: Doc) => void;
  onVerify: (doc: Doc) => void | Promise<void>;
  onRetry: (doc: Doc) => void | Promise<void>;
  onDelete: (doc: Doc) => void | Promise<void>;
}) {
  const f = useFormat();
  const m = useMessages(assets);
  const c = useMessages(common);
  const st = useMessages(states);
  const cs = f.content(doc.contentState);
  const vr = f.verification(doc.verificationState);
  const hint = f.processingHint(doc.contentState);
  const gov = kb.governanceEnabled;
  const readable = previewKind(doc.mime) !== "none";
  const localAddition = kb.sourceMode === "synced" && doc.source !== "connector";
  const record = verificationRecord(doc.verificationState, doc.verifiedAt, doc.expiresAt, new Date());

  return (
    <div className="flex flex-col gap-xs border-t border-border/60 py-sm first:border-t-0">
      <div className="flex items-center justify-between gap-md">
        <div className="min-w-0">
          <div className="truncate text-body-md font-medium">{doc.title}</div>
          {/* `doc.source` 原来是**原样印出来的机器值**——「upload」「api」「connector」,
              印在中文界面上一行人要读的字里。它说的是「谁把它放进来的」,而这决定了
              断源之后它还在不在、治理管不管它。 */}
          <div className="text-body-sm text-muted-foreground">
            {f.when(doc.createdAt)} · {formatBytes(doc.sizeBytes)} · {f.docSource(doc.source)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-sm">
          {/* 采集库里手工放进来的那一份。它不是错误,但它和周围那些同步来的不是
              一回事:源头不会更新它,而治理**照常**适用(`governanceApplies` 按
              每份文档的 `synced` 判断)。不标出来,它看起来就只是一份普通文档,
              直到有人问「为什么这份要复验、旁边那份不用」。 */}
          {localAddition && (
            <ToneBadge tone="info">{m.docLocalAdd}</ToneBadge>
          )}
          {gov && <ToneBadge tone={vr.tone}>{vr.label}</ToneBadge>}
          <ToneBadge tone={cs.tone}>{cs.label}</ToneBadge>

          {/* Preview is offered only for what we will actually render. For
              everything else the honest control is a download - a "预览" button
              that turns into a download is a broken promise, not a fallback. */}
          {readable ? (
            <Button size="sm" onClick={() => onPreview(doc)}>
              {m.actPreview}
            </Button>
          ) : (
            <Button size="sm" asChild>
              <a href={documentBytesHref(kb.id, doc.id)}>{m.actDownload}</a>
            </Button>
          )}

          {doc.contentState === "failed" && (
            <Button size="sm" variant="default" disabled={busy} onClick={() => onRetry(doc)}>
              {m.actReprocess}
            </Button>
          )}
          {gov && doc.contentState !== "failed" && (
            <Button size="sm" disabled={busy} onClick={() => onVerify(doc)}>
              {doc.verificationState === "verified" ? m.actReverify : m.actVerify}
            </Button>
          )}
          <DestructiveButton
            size="sm"
            confirm={{
              verb: c.delete,
              target: doc.title,
              // `deleted` is terminal in the content state machine - there is no
              // transition back out of it. Until DS 9 this button deleted on a
              // single click while being coloured red: warning by appearance,
              // undefended in behaviour, which is worse than not colouring it.
              consequence: m.deleteConsequence,
              onConfirm: () => Promise.resolve(onDelete(doc)),
            }}
          >
            {c.delete}
          </DestructiveButton>
        </div>
      </div>

      {doc.contentState === "failed" && doc.failureReason && (
        <div className="font-mono text-code-sm text-destructive">{doc.failureReason}</div>
      )}
      {gov && record.phrase && (
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
