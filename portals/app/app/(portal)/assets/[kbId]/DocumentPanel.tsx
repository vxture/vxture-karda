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
import { documentBytesHref, type Doc, type Folder, type Kb } from "../../../_lib/api";
import { formatBytes } from "../../../_lib/format";
import { useFormat } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { common } from "../../../_i18n/messages/common";
import { assets } from "../../../_i18n/messages/assets";
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
  folders,
  busy,
  onUpload,
  onVerify,
  onRetry,
  onDelete,
}: {
  kb: Kb;
  docs: Doc[] | null;
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

  // Only offer folders that exist. An empty catalogue means the filter row is
  // noise, not an empty control.
  const filterItems = [
    { value: "", label: c.all, count: docs?.length ?? 0 },
    ...folders.map((f) => ({ value: f.id, label: f.name, count: counts.get(f.id) ?? 0 })),
    ...(counts.get(UNFILED) ? [{ value: UNFILED, label: m.docUnfiled, count: counts.get(UNFILED) ?? 0 }] : []),
  ];

  return (
    <div className="flex flex-col gap-md">
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

function DocumentRow({
  kb,
  doc,
  busy,
  onPreview,
  onVerify,
  onRetry,
  onDelete,
}: {
  kb: Kb;
  doc: Doc;
  busy: boolean;
  onPreview: (doc: Doc) => void;
  onVerify: (doc: Doc) => void | Promise<void>;
  onRetry: (doc: Doc) => void | Promise<void>;
  onDelete: (doc: Doc) => void | Promise<void>;
}) {
  const f = useFormat();
  const m = useMessages(assets);
  const c = useMessages(common);
  const st = f.content(doc.contentState);
  const vr = f.verification(doc.verificationState);
  const hint = f.processingHint(doc.contentState);
  const gov = kb.governanceEnabled;
  const readable = previewKind(doc.mime) !== "none";
  const record = verificationRecord(doc.verificationState, doc.verifiedAt, doc.expiresAt, new Date());

  return (
    <div className="flex flex-col gap-xs border-t border-border/60 py-sm first:border-t-0">
      <div className="flex items-center justify-between gap-md">
        <div className="min-w-0">
          <div className="truncate text-body-md font-medium">{doc.title}</div>
          <div className="text-body-sm text-muted-foreground">
            {f.when(doc.createdAt)} · {formatBytes(doc.sizeBytes)} · {doc.source}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-sm">
          {gov && <ToneBadge tone={vr.tone}>{vr.label}</ToneBadge>}
          <ToneBadge tone={st.tone}>{st.label}</ToneBadge>

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
      {hint && <div className="text-body-sm text-muted-foreground">{hint}</div>}
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
