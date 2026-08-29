"use client";

import { useMemo, useRef, useState } from "react";
import {
  Button,
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
    if (filter === "") return docs;
    if (filter === UNFILED) return docs.filter((d) => d.folderId === null);
    return docs.filter((d) => d.folderId === filter);
  }, [docs, filter]);

  const failed = (shown ?? []).filter((d) => d.contentState === "failed");
  const rest = (shown ?? []).filter((d) => d.contentState !== "failed");

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

      {filterItems.length > 1 && (
        <SegmentedControl items={filterItems} value={filter} onChange={setFilter} size="sm" ariaLabel={m.docFilterAria} />
      )}

      {shown === null ? (
        <EmptyState title={m.docLoading} />
      ) : shown.length === 0 ? (
        <EmptyState
          title={filter === "" ? m.docEmpty : m.docEmptyFolder}
          description={filter === "" ? m.docEmptyHint : undefined}
        />
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

          {rest.length > 0 && (
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
                {doc.verifier ? ` · ${doc.verifier}` : ""}
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
