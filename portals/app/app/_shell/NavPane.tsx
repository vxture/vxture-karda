"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@vxture/design-system";
import { NAV_ITEMS, type NavItem } from "./nav";
import { useMessages } from "../_i18n/useMessages";
import { useFormat } from "../_i18n/useFormat";
import { shell as shellMessages } from "../_i18n/messages/shell";
import type { ShellData } from "../kb/demo/shell-types";

// 导航栏 (nav pane) - the left pane of the shell body: one card per
// functional domain, sitting on the shared ground (the pane itself paints
// nothing).
//
// Shell vocabulary, product-wide (owner 2026-08-24, spacing revised
// 2026-08-25). Use these words and no synonyms - "rail", "flank", "column",
// "sidebar" are all retired, and so are the casual English placeholders
// ("nav / content / action") the sizes were first discussed in:
//   顶栏 header        the 48px bar (Material: top app bar)
//   工作区 shell body   EVERYTHING below the header - the three panes together
//   导航栏 nav pane     this file, 280px. Not a "rail": Material reserves that
//                      for the 80dp icon strip; a 280px card column is a pane.
//   内容区 main pane    the middle, scrolling pane (ARIA <main>), width follows
//   值班台 steward dock the right pane, 400px. Named for what it IS - a duty
//                      desk with pending items - not "action pane"; it is a
//                      product surface, not a generic inspector.
//   栏间距 pane spacer  32px between panes (Material pane spacer)
//   外边距 window margin 24px from the browser edge (Material margins)
//   内衬 content inset  16px the 内容区 adds inside its own pane
//
// Each card answers the SAME three questions in the same order (owner
// 2026-08-24): what is the core figure, is it growing, what is wrong. The
// chart carries the core figure - a pie, horizontal bars, a split bar, or
// (where there is no honest ratio to draw) decorated figure tiles - and the
// growth/problem figures sit under it. Rules that shape the treatment:
//   · surfaces are translucent (bg-card/60), never a solid slab;
//   · the title is light - it names the card, it is not the loudest thing on it;
//   · charts are WASHES, not slabs: fills stay well under full saturation so a
//     card never shouts down the 内容区 (owner: the old work-mix bar
//     was too deep and stole the show);
//   · every chart states its number in type as well - the picture is how you
//     read the number at a glance, not a replacement for it;
//   · no two cards draw the same measure: coverage is 验证评测's subject, so
//     the asset card states counts instead of repeating the ratio;
//   · ACTIVE is a property of the CARD (brand border + brand-tinted veil),
//     not a highlight bar behind the title.
// Cards are few and deliberately loose - they may be tall; the caret is there
// for the rare moment a body is more than wanted.
//
// Collapsed = the pane unmounts entirely (no icon strip left behind).

// TYPOGRAPHY: every size in this file is a DS role (`text-body-md`,
// `text-code-md`, `text-title-lg`, `text-overline`, ...), never an arbitrary
// px. Two reasons beyond consistency: a role lands font-family/size/weight/
// line-height/tracking together (04-tokens-contract), and the user's 字号
// preference (`html.vx-font-small|default|large`) ONLY moves the roles - an
// arbitrary `text-[11px]` is frozen at 11px for everyone. Where a role is
// right except for one property, override that ONE property with a
// single-property utility (`font-mono`, `font-semibold`) - never reach for a
// second role.
//
// Baseline in this pane is 14px (`*-md` tier: body-md / label-md / code-md),
// owner 2026-08-24. 12px (`*-sm`) is reserved for badges and eyebrows.
//
// ⚠ Do NOT write `leading-none` here: Tailwind v4 resolves leading-* against
// --leading-*, then falls back to --spacing-*, and the DS registers
// `--spacing-none: 0px` - so it computes to line-height:0 and any box that
// also clips (`truncate`) renders EMPTY. The roles bring their own
// line-height, so no leading utility is needed at all.
const OPEN_KEY = "karda-shell-cards-closed";

// ONE palette for the whole pane, declared once and read by BOTH a mark and
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

/** Title-row tag: a bare count, no label. It only says "this domain has
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
function DomainTag({ itemKey, shell }: { itemKey: string; shell: ShellData | null }) {
  const m = useMessages(shellMessages);
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

function CardBody({ item, shell }: { item: NavItem; shell: ShellData | null }) {
  const m = useMessages(shellMessages);
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
        <span className="flex items-start gap-xs">
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
            <span className="text-body-md text-muted-foreground">{m.callsToday}</span>
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
              <LegendRow tone="brand" label={m.channelDirect} value={f.compact(c.directCalls)} pct={share(c.directCalls)} />
              <LegendRow tone="ai" label={m.channelRunos} value={f.compact(c.runosCalls)} pct={share(c.runosCalls)} />
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
              { k: m.gaps, v: String(e.gaps), tone: "text-destructive-text" },
            ]}
          />
        </span>
      );
    }
  }
}

export function NavPane({
  active,
  pathname,
  shell,
  collapsed,
}: {
  active: string | null;
  pathname: string;
  shell: ShellData | null;
  collapsed: boolean;
}) {
  const m = useMessages(shellMessages);
  const f = useFormat();
  const [closed, setClosed] = useState<Set<string>>(() => new Set());

  // Read after mount only: localStorage does not exist during SSR, so the
  // first frame must match the server (everything open - the default).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setClosed(new Set(parsed));
    } catch {
      // Storage unavailable: stay with everything open.
    }
  }, []);

  const toggleCard = useCallback((key: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // Best-effort persistence only.
      }
      return next;
    });
  }, []);

  const isActive = (href: string): boolean =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  // Collapsed = gone. Not a 64px icon strip, not width:0 - the pane
  // unmounts entirely (owner), the DS `ShellSidebarFrame` "hidden" semantics.
  if (collapsed) return null;

  return (
    // No padding of its own: the window margin owns the outer edge and the
    // pane spacer owns the gap to the 内容区; this pane only sets the rhythm
    // BETWEEN its cards. The scrollbar-hiding that used to be spelled here is
    // now a global rule (globals.css) - the reason it was written for turned
    // out to apply to every surface, not just this pane.
    <div className="flex w-[17.5rem] shrink-0 flex-col gap-md overflow-y-auto">
      {NAV_ITEMS.map((item) => {
        const domainActive = isActive(item.href);
        const open = !closed.has(item.key);

        return (
          // The card is carried by a GRADIENT, not by its outline (owner
          // 2026-08-24): the surface fades top-to-bottom so the panel separates
          // from the ground by light, and the hairline is pulled back to a
          // whisper. ACTIVE deepens the same gradient into brand and is the one
          // place the border is allowed to be legible - still no highlight bar
          // behind the title.
          <div
            key={item.key}
            className={`flex shrink-0 flex-col overflow-hidden rounded-lg border bg-gradient-to-b transition-colors duration-fast ease-standard ${
              domainActive
                ? "border-primary/25 from-primary/[0.12] to-primary/[0.03]"
                : "border-primary/[0.06] from-card/80 to-card/30 hover:from-card hover:to-card/50 dark:border-primary/10"
            }`}
          >
            <div className="flex items-center gap-2xs pr-xs">
              <Link
                href={item.href}
                aria-current={domainActive ? "page" : undefined}
                className="flex min-h-control-lg min-w-0 flex-1 items-center gap-xs pl-md text-label-md"
              >
                <Icon
                  name={item.icon}
                  size="sm"
                  className={domainActive ? "text-primary" : "text-muted-foreground"}
                />
                {/* Light title: it names the card, the chart is the loud part. */}
                <span className={`min-w-0 truncate ${domainActive ? "text-primary-text" : "text-foreground"}`}>
                  {m[item.labelKey]}
                </span>
                <DomainTag itemKey={item.key} shell={shell} />
                <span className="flex-1" />
              </Link>
              <button
                onClick={() => toggleCard(item.key)}
                aria-expanded={open}
                aria-label={open ? m.collapseItem(m[item.labelKey]) : m.expandItem(m[item.labelKey])}
                className="flex size-control-md shrink-0 items-center justify-center rounded-md text-muted-foreground/60 transition-colors duration-fast ease-standard hover:text-foreground"
              >
                <Icon name={open ? "chevron-up" : "chevron-down"} size="xs" />
              </button>
            </div>

            {open && (
              // Loose body (owner 2026-08-24): the chart gets real room above
              // and below instead of being packed against the title and the
              // edge - pt-md is the gap the title asked for.
              <div className="flex flex-col gap-md px-md pb-md pt-md">
                <CardBody item={item} shell={shell} />
                {item.sub && (
                  <div className="-mx-2xs flex flex-col border-t border-dashed border-primary/[0.08] pt-2xs dark:border-primary/15">
                    {item.sub.map((s) => {
                      const subActive = isActive(s.href);
                      return (
                        <Link
                          key={s.key}
                          href={s.href}
                          aria-current={subActive ? "page" : undefined}
                          className={`flex min-h-control-md items-center rounded-md px-2xs text-body-md transition-colors duration-fast ease-standard ${
                            subActive
                              ? "text-primary-text"
                              : "text-muted-foreground hover:bg-accent hover:text-foreground"
                          }`}
                        >
                          {m[s.labelKey]}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
