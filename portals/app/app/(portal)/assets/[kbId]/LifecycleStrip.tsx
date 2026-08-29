"use client";

// 一个库在**五条业务流**上的位置。
//
// 这一页原本是三个互不相干的 tab(文档 / 外部来源 / 设置),没有「这个库现在怎么样」
// 这一层——而资产总览的卡片上是有的(覆盖率、引用热度、卡尔达产出)。**点进来反而
// 少了**,列表页承诺的东西详情页兑现不了(owner 2026-08-29)。
//
// karda 对一个库而言有五条线,这条带就是它们的交汇处:
//
//   入库   上传 / 外部来源 / API 写入        -> 本页的「文档」「外部来源」
//   加工   fetch→parse→chunk→embed→commit   -> 加工管道域
//   抽取   断言 / 证据 / 实体、冲突裁决       -> 卡尔达提案(暂无库级数据源,见下)
//   验证   预验 → 待确认 → 已验证 → 到期     -> 验证评测域
//   供给   被 agent 检索引用                 -> 供给通道域
//
// **每一段只报这个库在那条线上的位置,不重做那个域的事**,然后把人送过去。这是它与
// 「再画一个仪表盘」的区别:仪表盘想把别处的内容搬过来,这条带只想说「你在这儿,
// 详细的在那边」。
//
// 「抽取」那一段曾经暂缺,理由是没有库级的断言读端点,而按现有数据硬凑一个数会是
// 编的。端点补上了(`GET /api/kb/:id/karda`,读 `kb/assertions/library-read.ts`),
// 于是这一段也补上了——**五条线到齐**。
import Link from "next/link";
import { Icon } from "@vxture/design-system";
import type { Doc, Binding, Kb, LibraryKarda, ParkedByDocument } from "../../../_lib/api";
import { useMessages } from "../../../_i18n/useMessages";
import { useFormat } from "../../../_i18n/useFormat";
import { assets as assetMessages } from "../../../_i18n/messages/assets";
// 「待复验 N」在验证评测目录里已经有一份,不在这里另加。
import { evaluation as evalMessages } from "../../../_i18n/messages/evaluation";

/** 段数 -> 列数。写成一张表而不是三目套三目:段数会随着业务流增减而变,而每加一种
 *  都要有一条**完整**的类名(见下面渲染处的注释)。 */
const COLS: Record<number, string> = {
  3: "@min-[64rem]:grid-cols-3",
  4: "@min-[64rem]:grid-cols-4",
  5: "@min-[64rem]:grid-cols-3 @min-[88rem]:grid-cols-5",
};

/** 一段。`href` 为空表示这条线在本页内就能看全,不必送出去。 */
interface Segment {
  label: string;
  value: string;
  note: string | null;
  /** 例外(驻留/失败/待复验),有就用告警色标出来。 */
  alert: string | null;
  href: string | null;
}

export interface LifecycleInput {
  kb: Kb;
  docs: Doc[];
  parked: ParkedByDocument;
  bindings: Binding[];
  /** 7 日引用与常读方。供给账本没有这个库的流量时为 null。 */
  supply: { heat7d: number; topConsumers: string[] } | null;
  /** 卡尔达产出。还没取到时为 null——与「取到了,是 0」不同。 */
  karda: LibraryKarda | null;
}

export function LifecycleStrip({ kb, docs, parked, bindings, supply, karda }: LifecycleInput) {
  const m = useMessages(assetMessages);
  const ev = useMessages(evalMessages);
  const f = useFormat();

  const total = docs.length;
  const liveBindings = bindings.filter((b) => b.state !== "revoked").length;
  const indexed = docs.filter((d) => d.contentState === "indexed").length;
  const failed = docs.filter((d) => d.contentState === "failed").length;
  const parkedCount = Object.keys(parked).length;
  const verified = docs.filter((d) => d.verificationState === "verified").length;
  const stale = docs.filter((d) => d.verificationState === "stale").length;

  const segments: Segment[] = [
    {
      label: m.lifeIngest,
      value: m.metaDocs(total),
      // 来源构成:说的是「这些内容从哪来」,而外部来源数是它的一部分。
      // 三种说法,而不是两种:一个已经声明自己是采集库、却一个来源都没接的库,
      // 说「上传与 API 写入」是把它描述成了另一种库——它缺的是一次绑定,不是内容。
      note:
        liveBindings > 0
          ? m.lifeIngestBindings(liveBindings)
          : kb.sourceMode === "synced"
            ? m.lifeIngestSyncedNone
            : m.lifeIngestUploadOnly,
      alert: null,
      href: null,
    },
    {
      label: m.lifeProcess,
      value: `${f.number(indexed)} / ${f.number(total)}`,
      note: m.lifeProcessNote,
      alert: parkedCount > 0 ? m.lifeParked(parkedCount) : failed > 0 ? m.metaFailed(failed) : null,
      href: "/pipeline/tasks",
    },
    // 抽取:还没取到(karda === null)时整段不出现,而不是画一个 0——一个还在路上的
    // 数字和一个真的为零的数字,在界面上长得一样就是在骗人。取到了但从没跑过,则
    // 显示「—」并说明原因,那是真话。
    ...(karda
      ? [
          {
            label: m.lifeExtract,
            value: karda.lastExtractedAt === null ? "\u2014" : f.number(karda.assertions),
            note: karda.lastExtractedAt === null ? m.lifeExtractNone : m.lifeExtractNote(karda.entities),
            // 待确认是这条线上唯一等着人的量,所以它走告警色,和别的段一个规矩。
            alert: karda.unverified > 0 ? m.lifeExtractPending(karda.unverified) : null,
            // 落到这个库自己的确认台,不再送去加工管道:「27 待确认」点过去就该是
            // 那 27 条,而不是另一个域的总览。
            href: `/assets/${kb.id}/knowledge`,
          },
        ]
      : []),
    // 治理关着时这一段整段不出现,而不是显示「覆盖 0%」——没纳入跟踪与覆盖为零
    // 是两件完全不同的事,后者会让人以为这个库很糟。
    ...(kb.governanceEnabled
      ? [
          {
            label: m.lifeVerify,
            value: total === 0 ? "—" : `${Math.round((verified / total) * 100)}%`,
            note: m.lifeVerifyNote(verified, total),
            alert: stale > 0 ? ev.staleCount(stale) : null,
            href: "/evaluation/queue",
          },
        ]
      : []),
    {
      label: m.lifeServe,
      value: supply ? f.number(supply.heat7d) : "—",
      note:
        supply && supply.topConsumers.length > 0
          ? m.lifeServeTop(supply.topConsumers.slice(0, 2).join(" · "))
          : m.lifeServeNone,
      alert: null,
      href: "/channels",
    },
  ];

  return (
    // 列数**跟着段数走**,不写死:治理关着、或卡尔达那一段还没取到时,段数会少,
    // 而写死列数会留一个空格子——一个空格子读起来像「这里本该有东西但坏了」。
    //
    // 每种列数各写一条**完整类名**,不拼字符串:Tailwind 在构建期扫源码,
    // `grid-cols-${n}` 这种拼出来的类名扫不到,生产构建里那个类根本不存在
    // (本轮已经被这条坑过一次)。
    //
    // 五段时多加一档断点:五格挤在 64rem 里每格只剩十几个字符宽,数字会换行。
    <div
      className={`grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border bg-border @min-[40rem]:grid-cols-2 ${COLS[segments.length] ?? COLS[4]}`}
    >
      {segments.map((s) => (
        <div key={s.label} className="flex flex-col gap-2xs bg-card px-lg py-md">
          <span className="flex items-center gap-2xs">
            <span className="text-body-sm text-muted-foreground">{s.label}</span>
            {s.href && (
              <Link
                href={s.href}
                aria-label={`${s.label} — ${m.lifeGoDomain}`}
                className="ml-auto flex items-center text-muted-foreground/60 transition-colors duration-fast ease-standard hover:text-primary-text"
              >
                <Icon name="arrow-right" size="xs" />
              </Link>
            )}
          </span>
          <span className="font-mono text-title-lg leading-[1.1] tabular-nums text-foreground">{s.value}</span>
          <span className="flex flex-wrap items-baseline gap-xs">
            {s.note && <span className="text-body-sm text-muted-foreground">{s.note}</span>}
            {s.alert && <span className="text-body-sm text-warning-text">{s.alert}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}
