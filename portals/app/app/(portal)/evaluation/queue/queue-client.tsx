"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Banner,
  Button,
  DataTable,
  EmptyState,
  FilterBar,
  Pagination,
  SegmentedControl,
  StatusBadge,
  useListPagination,
  type DataTableColumn,
} from "@vxture/design-system";
import {
  readGovernanceQueue,
  runGovernanceSweep,
  verifyQueueItem,
  loginHref,
  ApiError,
  type QueueItem,
  type QueueResult,
} from "../../../_lib/api";

import { SignInGate } from "../../../_lib/ui";
import { PageHead } from "../../../_shell/PageHead";
import { useFormat, type Failure } from "../../../_i18n/useFormat";
import { evaluation } from "../../../_i18n/messages/evaluation";
import { useMessages } from "../../../_i18n/useMessages";
import { shell } from "../../../_i18n/messages/shell";
import { common } from "../../../_i18n/messages/common";
import { assets } from "../../../_i18n/messages/assets";
import type { Message } from "../../../_i18n/catalog";

// 待复验队列 - batch 11's spine.
//
// 验证评测 could already COUNT the stale set. This is the list, with the control
// on each row, which is the whole difference between a dashboard and a
// workbench: the number stops being a report and becomes something you can
// drive down.
//
// THE ROW LEAVES THE LIST WHEN IT IS DONE. Verifying an item removes it from the
// queue immediately rather than re-rendering it with a green badge, because the
// queue is work remaining - an item that stays visible after being handled makes
// "am I finished" unanswerable, which is the single thing a queue must answer.
//
// 这是一张表,所以它用 DS 的表(KD-221,与文档清单同一次收编):此前是手工 flex 摆的
// 行——没有表头、没有分页,「确认」按钮的起点跟着标题长短左右晃。**「确认」是一列,
// 不进 ⋮ 菜单**:它是这一页最高频的动作,rowActions 那个 64px 图标位是给低频动作
// 组准备的,把主动作藏进菜单等于给每次确认多收一次点击。

type Filter = "all" | "stale" | "unverified";

const PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const;

export function QueueClient() {
  const f = useFormat();
  const m = useMessages(evaluation);
  const sh = useMessages(shell);
  const c = useMessages(common);
  const a = useMessages(assets);
  const params = useSearchParams();
  const kbId = params.get("kb") ?? undefined;

  const [data, setData] = useState<QueueResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<Failure | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  /** Items handled in this session, keyed id -> the state they were in, hidden
   *  optimistically so the row leaves the list the moment it is done rather than
   *  on the next full reload.
   *
   *  The STATE is kept, not just the id, because the filter chips carry
   *  per-state counts: subtracting a flat total would leave "待复验 1" showing
   *  over a queue with no stale items left in it. */
  const [done, setDone] = useState<Map<string, QueueItem["verificationState"]>>(new Map());

  const guard = useCallback((e: unknown, fallback: Message) => {
    if (e instanceof ApiError && e.status === 401) {
      setNeedsAuth(true);
      return;
    }
    setError({ cause: e, fb: fallback });
  }, []);

  const load = useCallback(async () => {
    try {
      setData(await readGovernanceQueue(kbId));
      setDone(new Map());
    } catch (e) {
      guard(e, evaluation.errQueue);
    }
  }, [kbId, guard]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onVerify(item: QueueItem) {
    if (busy) return;
    setBusy(item.id);
    setError(null);
    setNotice(null);
    try {
      await verifyQueueItem(item);
      setDone((prev) => new Map(prev).set(item.id, item.verificationState));
    } catch (e) {
      // A refusal here is worth reading rather than swallowing: 403 means this
      // caller is not the library's verifier, and 409 means the library has
      // governance off - two different fixes, neither of them "try again".
      guard(e, evaluation.errVerify);
    } finally {
      setBusy(null);
    }
  }

  async function onSweep() {
    if (sweeping) return;
    setSweeping(true);
    setError(null);
    setNotice(null);
    try {
      const r = await runGovernanceSweep();
      // Say what it CHANGED, not that it ran. "扫描 120 项" alone leaves the
      // operator unable to tell a working sweep from a no-op one.
      setNotice(
        r.staled > 0
          ? m.sweepDoneStaled(r.scanned, r.staled)
          : m.sweepDoneClean(r.scanned),
      );
      await load();
    } catch (e) {
      guard(e, evaluation.errSweep);
    } finally {
      setSweeping(false);
    }
  }

  const visible = useMemo(() => {
    if (!data) return null;
    return data.items
      .filter((i) => !done.has(i.id))
      .filter((i) => filter === "all" || i.verificationState === filter);
  }, [data, done, filter]);

  /** Totals net of what has been handled this session. The chips must agree with
   *  the list beneath them: a chip reading 待复验 1 over a queue with no stale
   *  rows left is the page contradicting itself. */
  const counts = useMemo(() => {
    if (!data) return { stale: 0, unverified: 0 };
    let stale = data.staleTotal;
    let unverified = data.unverifiedTotal;
    for (const state of done.values()) {
      if (state === "stale") stale -= 1;
      else unverified -= 1;
    }
    return { stale: Math.max(0, stale), unverified: Math.max(0, unverified) };
  }, [data, done]);

  const rows = visible ?? [];
  const pager = useListPagination(rows, PAGE_SIZE);
  const { resetPage } = pager;
  useEffect(() => {
    resetPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- resetPage 每次渲染都是新函数,挂进依赖会每帧重置
  }, [filter]);

  if (needsAuth) return <SignInGate from={"/evaluation/queue"} />;

  const remaining = counts.stale + counts.unverified;
  const scopeName = data?.items[0]?.kbName;

  const columns: DataTableColumn<QueueItem>[] = [
    {
      id: "item",
      header: m.colItem,
      cell: (item) => (
        <div className="min-w-0">
          <div className="truncate text-body-md font-medium">
            {item.title ?? <span className="text-muted-foreground">{m.untitledEntry}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-xs text-body-sm text-muted-foreground">
            <Link href={`/assets/${item.kbId}`} className="underline-offset-2 hover:underline">
              {item.kbName}
            </Link>
            <span>·</span>
            <span>{item.kind === "document" ? m.kindDocument : m.kindEntry}</span>
          </div>
        </div>
      ),
    },
    {
      id: "state",
      header: a.docColStatus,
      align: "center",
      width: "sm",
      cell: (item) => {
        const stale = item.verificationState === "stale";
        return (
          <span className="flex flex-wrap items-center justify-center gap-xs">
            {/* A stale item is a REGRESSION - it was trusted and lapsed - while an
                unverified one never was. Same queue, different urgency, so they
                must not read the same. */}
            <StatusBadge tone={stale ? "warning" : "neutral"} dot={false}>
              {f.verification(item.verificationState).label}
            </StatusBadge>
            {item.source === "connector" && (
              <StatusBadge tone="info" dot={false}>
                {m.externalSync}
              </StatusBadge>
            )}
          </span>
        );
      },
    },
    {
      id: "clock",
      header: a.kColValidity,
      width: "md",
      cell: (item) => {
        const stale = item.verificationState === "stale";
        return (
          <span className="text-body-sm text-muted-foreground">
            {stale && item.expiresAt ? (
              // The lapse is the fact that matters: it says how long this has
              // been quietly missing from the default recall tier.
              <span className="text-warning-text">{m.expiresAt(f.when(item.expiresAt))}</span>
            ) : item.verifiedAt ? (
              <>
                {m.lastVerified(f.when(item.verifiedAt))}
                {item.verifier ? ` · ${a.verifiedBy(item.verifier)}` : ""}
              </>
            ) : (
              "—"
            )}
          </span>
        );
      },
    },
    {
      // 「确认」是一**列**,不进 rowActions 的 ⋮ 菜单:队列的主动作要一次点击可达。
      id: "act",
      header: "",
      align: "right",
      width: "xs",
      cell: (item) => (
        <Button size="sm" variant="default" disabled={busy !== null} onClick={() => void onVerify(item)}>
          {busy === item.id ? "…" : c.confirm}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHead
        title={sh.subQueue}
        description={kbId ? m.queueScopeOne(scopeName ?? m.thisAsset) : m.queueScopeAll}
        meta={data ? m.queueMeta(counts.stale, counts.unverified) : undefined}
        actions={
          <>
            <Button variant="outline" disabled={sweeping} onClick={onSweep}>
              {sweeping ? m.sweeping : m.sweep}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/evaluation">{m.backToEvaluation}</Link>
            </Button>
          </>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
      {notice && <Banner tone="success" title={notice} />}

      {data && !data.live && <Banner tone="info" title={m.noDatabase} />}

      {data && (
        <FilterBar
          scope={
            <SegmentedControl
              items={[
                { value: "all", label: c.all, count: counts.stale + counts.unverified },
                { value: "stale", label: f.verification("stale").label, count: counts.stale },
                { value: "unverified", label: f.verification("unverified").label, count: counts.unverified },
              ]}
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              size="sm"
              ariaLabel={m.filterAria}
            />
          }
          count={
            <span className="text-body-sm text-muted-foreground">
              {done.size > 0 && <span className="mr-md text-success-text">{m.doneThisSession(done.size)}</span>}
              {m.remainingLead}
              <span className="font-mono text-foreground">{remaining}</span>
              {m.remainingTail}
              {data.truncated && m.truncatedNote}
            </span>
          }
        />
      )}

      <DataTable<QueueItem>
        columns={columns}
        rows={pager.pageRows}
        rowKey={(item) => item.id}
        loading={visible === null}
        loadingRows={6}
        empty={
          <EmptyState
            title={done.size > 0 ? m.pageDone : m.queueEmpty}
            description={done.size > 0 ? m.pageDoneHint : m.queueEmptyHint}
          />
        }
        footer={
          rows.length > 0 ? (
            <Pagination
              page={pager.page}
              pageCount={pager.pageCount}
              total={rows.length}
              pageSize={pager.pageSize}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
              onPageChange={pager.onPageChange}
              onPageSizeChange={pager.onPageSizeChange}
              previousLabel={c.pagerPrev}
              nextLabel={c.pagerNext}
              pageSizeLabel={c.pagerSizeLabel}
              pageSizeOptionTemplate={c.pagerSizeTemplate}
              countLabel={c.pagerCount(rows.length)}
            />
          ) : undefined
        }
      />
    </>
  );
}
