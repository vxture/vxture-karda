"use client";

// 域卡片的图形词汇 —— 环、饼、条、分段条,以及四个域各自的卡片体。
//
// 这套东西原本长在 `NavPane.tsx` 里,是 owner 2026-08-24/25 逐版调过的。
// KD-215(owner 2026-08-28)把它搬到首页:**卡片是「宏观 + 引导」的正确形态,而每一页
// 的左侧都挂一套带图表的卡片则太重**。所以搬,不删——调过的东西换个更合适的位置,
// 而导航栏收成一份标准菜单。
//
// 这个文件只画卡片,不知道自己被谁摆。首页摆的是整张卡;导航栏只借走 `DomainTag`
// ——一个计数徽章是菜单的标准词汇(未读数),与被退掉的图表不是一回事。
import type { ShellData } from "../kb/demo/shell-types";
import type { NavItem } from "./nav";
import { useMessages } from "../_i18n/useMessages";
import { shell as shellMessages } from "../_i18n/messages/shell";
import { channels as channelMessages } from "../_i18n/messages/channels";
import { evaluation as evalMessages } from "../_i18n/messages/evaluation";
import { useFormat } from "../_i18n/useFormat";

// ONE palette for the whole card set, declared once and read by BOTH a mark and
// the swatch/number beside it (owner 2026-08-24: the colours had drifted - a
// pie wedge mixed in oklab does not land on the same colour as a
// `bg-primary/60` dot, so legend and chart disagreed). Every mark below reads
// from this table, so a wedge, its dot and its figure cannot diverge again.
//
//   brand   volume / in-flight / assets   ai      the Runos capability plane
//   success verified, growth              warning waiting, needs a look
//   danger  failed, gaps
const TONE = {
  brand: "color-mix(in oklab, var(--color-primary) 55%, transparent)",
  ai: "color-mix(in oklab, var(--color-ai) 45%, transparent)",
  success: "color-mix(in oklab, var(--color-success) 55%, transparent)",
  warning: "color-mix(in oklab, var(--color-warning) 55%, transparent)",
  danger: "color-mix(in oklab, var(--color-destructive) 45%, transparent)",
} as const;

type Tone = keyof typeof TONE;

/** Type colour that pairs with a TONE fill. Neutral for brand and ai: a count
 *  is not a status, so only the exception tones speak in colour. */
const TONE_TEXT: Record<Tone, string> = {
  brand: "text-foreground",
  ai: "text-foreground",
  success: "text-success-text",
  warning: "text-warning-text",
  danger: "text-destructive-text",
};

/** 环形图 as the frame around a figure: a near-closed arc with a small
 *  opening at the bottom, the number read off the middle. 知识资产 owns no
 *  ratio of its own - coverage is 验证评测's whole subject - so the ring does
 *  not pretend to gauge anything; it is the treatment the two counts get, with
 *  the week's move stated beside the label (owner 2026-08-24).
 *
 *  Rejected alternative: two filled figure tiles. They read as crude - a
 *  rectangle behind a number decorates nothing, it just boxes it. */
function Ring({ value, label, note }: { value: string; label: string; note?: string }) {
  const size = 72;
  const w = 5;
  const r = (size - w) / 2;
  const c = 2 * Math.PI * r;
  const opening = 0.09; // a ring, not a seal
  return (
    <span className="flex min-w-0 flex-1 flex-col items-center gap-2xs">
      <span className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TONE.brand}
            strokeWidth={w}
            strokeLinecap="round"
            strokeDasharray={`${c * (1 - opening)} ${c}`}
            // Rotated so the opening sits centred at the bottom.
            transform={`rotate(${90 + (opening * 360) / 2} ${size / 2} ${size / 2})`}
          />
        </svg>
        {/* Role + ONE single-property override: title-lg is the right
            size/weight, only the family has to become mono for figures. */}
        <span className="absolute text-title-lg font-mono text-foreground">{value}</span>
      </span>
      <span className="flex items-baseline gap-2xs">
        <span className="text-body-md text-muted-foreground">{label}</span>
        {note && <span className="font-mono text-code-md text-success-text">{note}</span>}
      </span>
    </span>
  );
}

/** Wedge path for a pie slice, angles in radians clockwise from 12 o'clock. */
function wedge(c: number, r: number, from: number, to: number): string {
  const at = (a: number) => [c + r * Math.sin(a), c - r * Math.cos(a)];
  const [x1, y1] = at(from);
  const [x2, y2] = at(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M ${c} ${c} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`;
}

/** 饼图: how one total splits between channels - the clearest read of a
 *  two-way share, which is exactly what 供给通道 is about. */
function Pie({ slices, size = 58 }: { slices: { value: number; tone: Tone }[]; size?: number }) {
  const total = slices.reduce((n, s) => n + s.value, 0) || 1;
  let a = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0" aria-hidden="true">
      {slices.map((s, i) => {
        const from = a;
        a += (s.value / total) * Math.PI * 2;
        return (
          <path
            key={i}
            d={wedge(size / 2, size / 2 - 1, from, a)}
            fill={TONE[s.tone]}
            stroke="var(--color-card)"
            strokeWidth="1.5"
          />
        );
      })}
    </svg>
  );
}

/** Legend line for the pie: swatch, name, count, share. The swatch is painted
 *  from the SAME TONE entry as its wedge - never a look-alike utility class. */
function LegendRow({ tone, label, value, pct }: { tone: Tone; label: string; value: string; pct: number }) {
  return (
    <span className="flex items-center gap-xs text-body-md text-muted-foreground">
      <span aria-hidden="true" className="size-[8px] shrink-0 rounded-[2px]" style={{ background: TONE[tone] }} />
      <span className="shrink-0">{label}</span>
      <span className="ml-auto font-mono text-code-md text-foreground">{value}</span>
      <span className="w-[32px] shrink-0 text-right font-mono text-code-md">{pct}%</span>
    </span>
  );
}

/** Bar length for the horizontal 柱状图. Linear while the spread is modest;
 *  once the largest value runs an order of magnitude past the smallest, the
 *  scale switches to log1p - otherwise a 3 beside a 240 draws as a hairline
 *  and the row reads as empty rather than as small (owner 2026-08-24). */
function barPct(value: number, all: number[]): number {
  const max = Math.max(...all, 1);
  const nonZero = all.filter((n) => n > 0);
  const min = nonZero.length ? Math.min(...nonZero) : max;
  const log = max / Math.max(min, 1) >= 10;
  const f = (n: number) => (log ? Math.log1p(n) : n);
  return Math.max((f(value) / f(max)) * 100, 4);
}

/** 横向柱状图: one labelled row per category, value read off the right. */
function BarRows({ rows }: { rows: { label: string; value: number; tone: Tone }[] }) {
  const all = rows.map((r) => r.value);
  return (
    <span className="flex flex-col gap-sm">
      {rows.map((r) => (
        <span key={r.label} className="flex items-center gap-sm">
          <span className="w-[46px] shrink-0 text-body-md text-muted-foreground">{r.label}</span>
          <span aria-hidden="true" className="h-[9px] min-w-0 flex-1 overflow-hidden rounded-full bg-muted/50">
            <span
              className="block h-full rounded-full"
              style={{ width: `${barPct(r.value, all)}%`, background: TONE[r.tone] }}
            />
          </span>
          <span className={`w-[32px] shrink-0 text-right font-mono text-code-md font-semibold ${TONE_TEXT[r.tone]}`}>
            {r.value}
          </span>
        </span>
      ))}
    </span>
  );
}

/** Split bar: parts of one whole, the remainder left as bare track. */
function SplitBar({ parts }: { parts: { pct: number; tone: Tone }[] }) {
  return (
    <span aria-hidden="true" className="flex h-[10px] w-full overflow-hidden rounded-full bg-muted/60">
      {parts.map((p, i) => (
        <span key={i} className="h-full" style={{ width: `${p.pct}%`, background: TONE[p.tone] }} />
      ))}
    </span>
  );
}

export /** Title-row tag: a bare count, no label. It only says "this domain has
 *  something to look at"; WHAT it is belongs on the domain page, not in the
 *  chrome (owner 2026-08-24). */
function TitleTag({ count, tone, label }: { count: number; tone: "warning" | "danger"; label: string }) {
  return (
    <span
      aria-label={`${label} ${count}`}
      title={`${label} ${count}`}
      className={`shrink-0 rounded-full px-xs py-[1px] font-mono text-code-sm ${
        tone === "warning"
          ? "bg-warning-muted/60 text-warning-text"
          : "bg-destructive-muted/50 text-destructive-text"
      }`}
    >
      {count}
    </span>
  );
}

/** The tag a domain card shows beside its title, if it has one. A component
 *  rather than a plain call so it can read the catalog itself. */
export function DomainTag({ itemKey, shell }: { itemKey: string; shell: ShellData | null }) {
  const m = useMessages(shellMessages);
  const ch = useMessages(channelMessages);
  const ev = useMessages(evalMessages);
  const f = useFormat();
  if (!shell) return null;
  if (itemKey === "overview" && shell.overview.needsAttention > 0) {
    return <TitleTag count={shell.overview.needsAttention} tone="warning" label={f.health("attention").label} />;
  }
  if (itemKey === "channels" && shell.channels.degraded > 0) {
    return <TitleTag count={shell.channels.degraded} tone="warning" label={m.degradedChannels} />;
  }
  return null;
}

/** One line of small figures under a chart. */
function FootFigures({ items }: { items: { k: string; v: string; tone?: string }[] }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-sm gap-y-2xs text-body-md text-muted-foreground">
      {items.map((i) => (
        <span key={i.k} className="whitespace-nowrap">
          {i.k}
          <span className={`ml-2xs font-mono text-code-md ${i.tone ?? "text-foreground"}`}>{i.v}</span>
        </span>
      ))}
    </span>
  );
}

export function DomainCardBody({ item, shell }: { item: NavItem; shell: ShellData | null }) {
  const m = useMessages(shellMessages);
  const ch = useMessages(channelMessages);
  const ev = useMessages(evalMessages);
  const f = useFormat();
  if (!shell) {
    // Same height as a settled body, so the pane does not jump on arrival.
    return <span className="flex h-[68px] items-center text-body-md text-muted-foreground">{m.paneLoading}</span>;
  }
  switch (item.key) {
    case "overview": {
      // 资产 + 知识, the two counts this domain IS, each ringed. Coverage is
      // deliberately absent - it is 验证评测's subject, and saying it twice
      // made the pane read as one metric repeated. 需关注 has moved to the
      // title tag: the pane flags that there is something, the page says what
      // (owner 2026-08-24).
      const o = shell.overview;
      return (
        // `max-w` 而不是加大 gap:`Ring` 是 `flex-1` 的,所以在半幅卡片里两个环会各自
        // 漂到四分之一处,看起来像两个不相干的圆。**它们是一对**,给这一对一个上限
        // 宽度、再让这对居中,才读得出是一对。(为此改 gap 是无效的——`flex-1` 会把
        // gap 之外的空间全部吃掉。)
        <span className="mx-auto flex w-full max-w-[22rem] items-start gap-xs">
          <Ring value={f.compact(o.assetCount)} label={m.ringAssets} />
          <Ring value={f.compact(o.entryCount)} label={m.ringEntries} note={`+${f.compact(o.weeklyNew)}`} />
        </span>
      );
    }
    case "channels": {
      // The page's own headline is the split between the two supply channels
      // plus today's volume - so the card says exactly that. Channel names are
      // written out (直供通道 / 能力平台): abbreviated to 直供 / 能力 they read
      // as adjectives rather than as the two things the page is about.
      const c = shell.channels;
      const total = Math.max(c.directCalls + c.runosCalls, 1);
      const share = (n: number) => Math.round((n / total) * 100);
      return (
        <span className="flex flex-col gap-sm">
          <span className="flex items-baseline gap-xs">
            <span className="text-title-lg font-mono text-foreground">{f.compact(c.todayCalls)}</span>
            <span className="text-body-md text-muted-foreground">{ch.callsToday}</span>
            <span
              className={`ml-auto font-mono text-code-md ${
                c.deltaPct >= 0 ? "text-success-text" : "text-destructive-text"
              }`}
            >
              {c.deltaPct >= 0 ? "▲" : "▼"}
              {Math.abs(c.deltaPct)}%
            </span>
          </span>
          <span className="flex items-center gap-sm">
            <Pie
              slices={[
                { value: c.directCalls, tone: "brand" },
                { value: c.runosCalls, tone: "ai" },
              ]}
            />
            <span className="flex min-w-0 flex-1 flex-col gap-xs">
              <LegendRow tone="brand" label={ch.viaDirect} value={f.compact(c.directCalls)} pct={share(c.directCalls)} />
              <LegendRow tone="ai" label={ch.viaRunos} value={f.compact(c.runosCalls)} pct={share(c.runosCalls)} />
            </span>
          </span>
        </span>
      );
    }
    case "pipeline": {
      const p = shell.pipeline;
      return (
        <span className="flex flex-col gap-md">
          <BarRows
            rows={[
              { label: m.pipeInflight, value: p.inflight, tone: "brand" },
              { label: m.pipePending, value: p.pending, tone: "warning" },
              { label: m.pipeFailed, value: p.failedResident, tone: "danger" },
            ]}
          />
          <FootFigures
            items={[
              { k: m.doneToday, v: m.docsCount(p.docsToday), tone: "text-success-text" },
              { k: m.rebuilding, v: String(p.rebuilding) },
            ]}
          />
        </span>
      );
    }
    default: {
      // 验证评测: the corpus split into 已验证 / 待复验 / 未验证 - the one
      // ratio this domain exists to move, with the gaps it still owes.
      const e = shell.evaluation;
      const total = Math.max(e.verified + e.stale + e.unverified, 1);
      return (
        <span className="flex flex-col gap-sm">
          <span className="flex items-baseline gap-xs">
            <span className="text-title-lg font-mono text-foreground">{e.coveragePct}%</span>
            <span className="text-body-md text-muted-foreground">{m.verifyCoverage}</span>
            <span className="ml-auto text-body-md text-muted-foreground">
              {f.verification("unverified").label}
              <span className="ml-2xs font-mono text-code-md text-foreground">{f.compact(e.unverified)}</span>
            </span>
          </span>
          <SplitBar
            parts={[
              { pct: (e.verified / total) * 100, tone: "success" },
              { pct: (e.stale / total) * 100, tone: "warning" },
            ]}
          />
          <FootFigures
            items={[
              { k: f.verification("verified").label, v: f.compact(e.verified), tone: "text-success-text" },
              { k: f.verification("stale").label, v: String(e.stale), tone: "text-warning-text" },
              { k: ev.gapsLabel, v: String(e.gaps), tone: "text-destructive-text" },
            ]}
          />
        </span>
      );
    }
  }
}
