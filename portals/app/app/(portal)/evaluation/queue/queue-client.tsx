"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Banner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Icon,
  SegmentedControl,
  StatusBadge,
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

type Filter = "all" | "stale" | "unverified";

export function QueueClient() {
  const f = useFormat();
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
          ? `续验扫描完成：扫描 ${r.scanned} 项，${r.staled} 项到期转为待复验，已加入下面的队列。`
          : `续验扫描完成：扫描 ${r.scanned} 项，没有新到期的内容。`,
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

  if (needsAuth) return <SignInGate href={loginHref("/evaluation/queue")} />;

  const remaining = counts.stale + counts.unverified;
  const scopeName = data?.items[0]?.kbName;

  return (
    <>
      <PageHead
        title="待复验队列"
        description={kbId ? `仅显示 ${scopeName ?? "该资产"} 的待办` : "工作区内需要人工确认的内容"}
        meta={data ? `待复验 ${counts.stale} · 未验证 ${counts.unverified}` : undefined}
        actions={
          <>
            <Button variant="outline" disabled={sweeping} onClick={onSweep}>
              {sweeping ? "扫描中…" : "续验扫描"}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/evaluation">返回验证评测</Link>
            </Button>
          </>
        }
      />

      {error && <Banner tone="danger" title={f.failure(error) ?? ""} />}
      {notice && <Banner tone="success" title={notice} />}

      {data && !data.live && (
        <Banner
          tone="info"
          title="当前未连接数据库，队列为空。这里从不显示演示数据——带着能用按钮的演示队列，正是这一批要避免的东西。"
        />
      )}

      {data && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-md py-md">
            <SegmentedControl
              items={[
                { value: "all", label: "全部", count: counts.stale + counts.unverified },
                { value: "stale", label: "待复验", count: counts.stale },
                { value: "unverified", label: "未验证", count: counts.unverified },
              ]}
              value={filter}
              onChange={(v) => setFilter(v as Filter)}
              size="sm"
              ariaLabel="按验证状态筛选"
            />
            <span className="ml-auto text-body-sm text-muted-foreground">
              {done.size > 0 && <span className="mr-md text-success-text">本次已处理 {done.size} 项</span>}
              还剩 <span className="font-mono text-foreground">{remaining}</span> 项
              {data.truncated && "（仅显示前 50 项）"}
            </span>
          </CardContent>
        </Card>
      )}

      {visible === null ? (
        <EmptyState title="正在加载队列…" />
      ) : visible.length === 0 ? (
        <EmptyState
          title={done.size > 0 ? "这一页处理完了" : "没有待办"}
          description={
            done.size > 0
              ? "刷新以取回下一页，或回到验证评测看覆盖率的变化。"
              : "该范围内的内容都已验证，或所在库未开启验证治理。"
          }
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col py-sm">
            {visible.map((item) => (
              <QueueRow key={item.id} item={item} busy={busy === item.id} onVerify={onVerify} />
            ))}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function QueueRow({
  item,
  busy,
  onVerify,
}: {
  item: QueueItem;
  busy: boolean;
  onVerify: (item: QueueItem) => void | Promise<void>;
}) {
  const f = useFormat();
  const stale = item.verificationState === "stale";
  return (
    <div className="flex items-center gap-md border-t border-border/60 py-sm first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-sm">
          {/* A stale item is a REGRESSION - it was trusted and lapsed - while an
              unverified one never was. Same queue, different urgency, so they
              must not read the same. */}
          <StatusBadge tone={stale ? "warning" : "neutral"} dot={false}>
            {stale ? "待复验" : "未验证"}
          </StatusBadge>
          <span className="truncate text-body-md font-medium">
            {item.title ?? <span className="text-muted-foreground">（无标题条目）</span>}
          </span>
          {item.source === "connector" && (
            <StatusBadge tone="info" dot={false}>
              外部同步
            </StatusBadge>
          )}
        </div>
        <div className="mt-2xs flex flex-wrap items-center gap-sm text-body-sm text-muted-foreground">
          <Link href={`/assets/${item.kbId}`} className="underline-offset-2 hover:underline">
            {item.kbName}
          </Link>
          <span>·</span>
          <span>{item.kind === "document" ? "文档" : "条目"}</span>
          {stale && item.expiresAt && (
            <>
              <span>·</span>
              {/* The lapse is the fact that matters: it says how long this has
                  been quietly missing from the default recall tier. */}
              <span className="text-warning-text">{f.when(item.expiresAt)} 到期</span>
            </>
          )}
          {item.verifiedAt && (
            <>
              <span>·</span>
              <span>
                上次 {f.when(item.verifiedAt)}
                {item.verifier ? ` · ${item.verifier}` : ""}
              </span>
            </>
          )}
        </div>
      </div>
      <Button size="sm" variant="default" disabled={busy} onClick={() => onVerify(item)}>
        {busy ? "…" : "验证"}
      </Button>
    </div>
  );
}
