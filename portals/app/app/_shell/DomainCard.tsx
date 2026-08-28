"use client";

// 域卡片:首页那四张。
//
// **框架一致,形式各异**(owner 2026-08-28,两轮改到这个形状)。
//
// 第一版是四段各写各的 JSX,谁也不管谁,于是标题字号、留白、数字的摆法各漂各的。
// 第二版为了治它,把四张全做成饼图——一致了,但**矫枉过正**:饼只擅长回答「两三份
// 怎么分」,拿它去表达一个比率、一组计数、一条队列的构成,三处都不称手。
//
// 现在是第三版:**一致的是框架和原语,不是图形**。
//
//   份额(两条通道)      -> 环形,中心放总数
//   构成(队列的三种状态)-> 分段条,段上不标百分比(条已经画了)
//   比率(验证覆盖)      -> 进度条,空轨就是还没做的部分
//   计数(资产与知识)    -> 两个大数,外加一张分布图把两维联系起来(`DistBars`)
//
// 四个 body 各选各的形式,但都从同一组原语(`SegBar` / `Ring` / `Legend` / `Chips` /
// `Headline` / `Pill`)里取,并被同一个三区框架包着。想让某张卡自成一派,得先加一个
// 新原语——那是一次要过脑子的改动,而不是随手多写十行 JSX。
//
// 三个区,自上而下:
//   ① 标题区   {图标}{标题 + 说明}。图标独占两行,标题与说明左对齐两行,标题字号放大
//   ② 统计区   主数 + 右上角(增长/例外)+ 饼图 + 图例(名称 / 数字 / 份额)
//   ③ 操作区   左:该域的重点详情链接   右:进入
//
// 色表与图形词汇原本长在 `NavPane.tsx` 里,KD-215 把卡片搬到首页时一起搬来
// (130-portal-shell §1.3)。导航栏只借走计数徽章 `DomainTag`。
import Link from "next/link";
import { Icon, StatusBadge } from "@vxture/design-system";
import type { ShellData } from "../kb/demo/shell-types";
import { NAV_ITEMS } from "./nav";

/** 一条**真实的**导航条目,不是任意 `NavItem`。
 *  用 `NAV_ITEMS[number]` 而不是 `NavItem`,是为了让 `labelKey` / `descKey` 保持
 *  字面量类型——widen 成整张目录的键之后,`m[key]` 的类型里会混进目录里那些
 *  取函数的条目,`{m[item.labelKey]}` 就不再是一个可渲染的东西。 */
type DomainNavItem = (typeof NAV_ITEMS)[number];
import { useMessages } from "../_i18n/useMessages";
import { shell as shellMessages } from "../_i18n/messages/shell";
import { channels as channelMessages } from "../_i18n/messages/channels";
import { evaluation as evalMessages } from "../_i18n/messages/evaluation";
import { assets as assetMessages } from "../_i18n/messages/assets";
import { common as commonMessages } from "../_i18n/messages/common";
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
  // 「还没做」不是一个状态色。未验证那一段用中性:染成第三种颜色会让人以为
  // 它和已验证/待复验是同一类事,而它其实是「剩下的部分」。
  muted: "color-mix(in oklab, var(--color-muted-foreground) 28%, transparent)",
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
  muted: "text-muted-foreground",
};

/** 目录与格式化器的解析结果类型。四个 body 各取所需,签名写出来比到处 `any` 强。 */
type Msgs = ReturnType<typeof useMessages<typeof shellMessages>>;
type ChMsgs = ReturnType<typeof useMessages<typeof channelMessages>>;
type EvMsgs = ReturnType<typeof useMessages<typeof evalMessages>>;
type AsMsgs = ReturnType<typeof useMessages<typeof assetMessages>>;
type Fmt = ReturnType<typeof useFormat>;

// --- 图形词汇 -----------------------------------------------------------------
//
// **形式由数据的性质决定,不由「四张卡要一致」决定**(owner 2026-08-28 第二轮)。
// 上一版把四张全做成饼图,那是矫枉过正:饼只擅长回答「两三份怎么分」,拿它去表达
// 一个比率、一组计数、一条队列的构成,三处都不称手。
//
//   份额(两条通道)      -> 环形,中心放总数
//   构成(队列的三种状态)-> 分段条,段上直接标数
//   比率(验证覆盖)      -> 进度条,空轨就是还没做的部分
//   计数(资产与知识)    -> 就是两个大数,配一条细的健康条
//
// 一致的是**框架**(标题区 / 统计区 / 操作区)和这几个原语,不是图形本身。

interface Slice {
  label: string;
  value: number;
  tone: Tone;
}

const sum = (xs: Slice[]) => xs.reduce((n, x) => n + Math.max(0, x.value), 0);

/**
 * 分段条:一个总量的构成,横着摊开。
 *
 * 段之间留一道缝(`gap`),不是紧挨着——缝让相邻两段可分辨,不必靠颜色对比度硬撑;
 * 也让「某一段是 0」这件事看得出来(它整段消失,而不是变成一条难以察觉的细线)。
 *
 * 空总量画一条空轨而不是什么都不画:一个域此刻没有任何在制,是状态,不是缺数据。
 */
function SegBar({ slices, className = "" }: { slices: Slice[]; className?: string }) {
  const total = sum(slices);
  return (
    <span className={`flex h-2xs w-full gap-[2px] overflow-hidden rounded-full bg-muted ${className}`}>
      {total > 0 &&
        slices.map((s) =>
          Math.max(0, s.value) > 0 ? (
            <span
              key={s.label}
              className="h-full first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: Math.max(0, s.value), background: TONE[s.tone] }}
            />
          ) : null,
        )}
    </span>
  );
}

/**
 * 环形:一个总量分成两三份,中心是总数本身。
 *
 * 用环不用实心饼:中心那块空地是免费的,拿来放总数比在旁边再摆一行数字省一次视线
 * 移动。描边式画法(`stroke-dasharray`)而不是扇形路径——同一个半径上排布,段与段
 * 之间天然留缝。
 */
function Ring({
  slices,
  center,
  caption,
  size = 92,
}: {
  slices: Slice[];
  center: string;
  caption: string;
  size?: number;
}) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = sum(slices);
  const gap = 3; // 段间缝,单位是弧长
  let offset = 0;
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-muted)" strokeWidth={stroke} />
        {total > 0 &&
          slices.map((s) => {
            const len = Math.max(0, (Math.max(0, s.value) / total) * c - gap);
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={TONE[s.tone]}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, len)} ${c}`}
                strokeDashoffset={-offset}
              />
            );
            offset += (Math.max(0, s.value) / total) * c;
            return len > 0 ? el : null;
          })}
      </svg>
      <span className="absolute flex flex-col items-center">
        <span className="font-mono text-title-sm tabular-nums text-foreground">{center}</span>
        <span className="text-body-sm text-muted-foreground">{caption}</span>
      </span>
    </span>
  );
}

/**
 * 分布条列:**一根条一个资产,条长是它装着多少知识**。
 *
 * 这一张图同时说两个维度(owner 2026-08-28):条的**根数**是资产维度,条的**长度**
 * 是知识维度。只给「12 个资产 / 3,852 条知识」两个总数,看不出这 3,852 是均匀铺在
 * 12 个库里,还是有一个库装了九成——而那两种情况该做的事完全不同。
 *
 * 长尾**并成一条**而不是截断:截断会让条加起来对不上卡片自己报的总数,一张自己对
 * 不上自己的图比没有图更糟。
 *
 * 长度按最大值归一,不按总数:按总数的话,十几个库时每根条都短得看不出差别,而这
 * 张图要回答的正是「谁比谁多」。
 */
function DistBars({ rows }: { rows: { name: string; value: number; text: string; muted?: boolean }[] }) {
  const max = Math.max(1, ...rows.map((r) => Math.max(0, r.value)));
  return (
    <span className="flex flex-col gap-2xs">
      {rows.map((r) => (
        <span key={r.name} className="flex items-center gap-sm">
          <span className="w-[7.5rem] shrink-0 truncate text-body-sm text-muted-foreground">{r.name}</span>
          <span className="flex h-2xs min-w-0 flex-1 items-center overflow-hidden rounded-full bg-muted">
            <span
              className="h-full rounded-full"
              style={{
                width: `${Math.max(2, (Math.max(0, r.value) / max) * 100)}%`,
                background: r.muted ? TONE.muted : TONE.brand,
              }}
            />
          </span>
          <span
            className={`w-[3.5rem] shrink-0 text-right font-mono text-code-md tabular-nums ${
              r.muted ? "text-muted-foreground" : "text-foreground"
            }`}
          >
            {r.text}
          </span>
        </span>
      ))}
    </span>
  );
}

/** 图例:一行一份,名称在左、数字与份额在右。给环形用——它的份额值得读出来。 */
function Legend({ slices }: { slices: Slice[] }) {
  const total = sum(slices);
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-sm">
      {slices.map((s) => (
        <span key={s.label} className="flex items-baseline gap-xs">
          <span className="size-2xs shrink-0 translate-y-[-0.1em] rounded-full" style={{ background: TONE[s.tone] }} />
          <span className="min-w-0 flex-1 truncate text-body-sm text-muted-foreground">{s.label}</span>
          <span className={`font-mono text-code-md tabular-nums ${TONE_TEXT[s.tone]}`}>{s.value}</span>
          <span className="w-[2.75rem] text-right font-mono text-code-sm tabular-nums text-muted-foreground/70">
            {total > 0 ? Math.round((Math.max(0, s.value) / total) * 100) : 0}%
          </span>
        </span>
      ))}
    </span>
  );
}

/** 紧凑图例:一排小片,名称与数字并排。给分段条用——条已经画了份额,再列一次百分比
 *  是把同一件事说两遍。 */
function Chips({ slices }: { slices: Slice[] }) {
  return (
    <span className="flex flex-wrap items-center gap-x-lg gap-y-2xs">
      {slices.map((s) => (
        <span key={s.label} className="flex items-baseline gap-2xs">
          <span className="size-2xs shrink-0 translate-y-[-0.1em] rounded-full" style={{ background: TONE[s.tone] }} />
          <span className="text-body-sm text-muted-foreground">{s.label}</span>
          <span className={`font-mono text-code-md tabular-nums ${TONE_TEXT[s.tone]}`}>{s.value}</span>
        </span>
      ))}
    </span>
  );
}

/** 主数:大号等宽 + 名字。四张卡的主数都用它,所以它们在同一条竖线上起笔。 */
function Headline({ value, label, aside }: { value: string; label: string; aside?: React.ReactNode }) {
  return (
    <span className="flex items-baseline gap-sm">
      <span className="font-mono text-title-xl leading-[1.1] tabular-nums text-foreground">{value}</span>
      <span className="text-body-md text-muted-foreground">{label}</span>
      {aside ? <span className="ml-auto">{aside}</span> : null}
    </span>
  );
}

/** 右上角那一小片:增长或例外。做成**药丸**而不是裸文字——它要能被一眼从主数旁边
 *  摘出来,而裸文字会和主数的单位混在一起。 */
function Pill({ text, tone }: { text: string; tone: "success" | "warning" | "danger" | "muted" }) {
  const skin = {
    success: "bg-success-muted/60 text-success-text",
    warning: "bg-warning-muted/60 text-warning-text",
    danger: "bg-destructive-muted/60 text-destructive-text",
    muted: "bg-muted text-muted-foreground",
  }[tone];
  return <span className={`rounded-full px-xs py-[2px] font-mono text-code-sm tabular-nums ${skin}`}>{text}</span>;
}

// --- 标题后面那个警示 ---------------------------------------------------------
//
// 从一个**裸数字**改成 DS 的 `StatusBadge` 胶囊(owner 2026-08-28)。裸数字不够明确:
// 一个孤零零的 `4` 只说明有四个什么,既不说要不要处理,也不说有多急——读的人得先记住
// 「橙色数字 = 需关注」这条约定,而那正是不该要求人记住的东西。
//
// DS 对这个组件的说法是**三件一体:表意图标 + 语气底色 + 文字**,少哪一件都退化
// (只有底色 = 靠记颜色;只有文字 = 一屏扫不出来;只有图标 = 同一张图各处含义不同)。
//
// 图标不取语气缺省值,显式指定,因为要区分的是**两种意图**而不是两种严重度:
//
//   danger  → `warning`(感叹号)  出错了,要去修:失败 / 降级 / 缺口
//   warning → `help`(问号)      要你判断:待确认 / 待复验 / 需关注
//
// 缺省值里 danger 是个叉,那读作「失败了」——对「缺口」和「降级」不准确。
//
// 徽章是**链接**,点进去就是处理它的地方。一个说「有六个失败」却点不动的标记,
// 只是把焦虑前移。

/** 一条警示。`tone` 决定颜色与严重度,`href` 是处理它的地方。 */
interface Signal {
  count: number;
  tone: "danger" | "warning";
  label: string;
  href: string;
}

/**
 * 这个域此刻最该被看见的那一条警示,没有就是 null。
 *
 * **多条时取最重的**(owner):一个位置只放一条,放两条就要读的人自己排序。
 * danger 压过 warning——前者是坏了,后者是等人判断,先修坏的。
 */
function signalFor(itemKey: string, shell: ShellData, m: Msgs, ch: ChMsgs, ev: EvMsgs, f: Fmt): Signal | null {
  const pick = (candidates: Signal[]): Signal | null => {
    const live = candidates.filter((c) => c.count > 0);
    return live.find((c) => c.tone === "danger") ?? live[0] ?? null;
  };
  switch (itemKey) {
    case "overview":
      return pick([
        { count: shell.overview.needsAttention, tone: "warning", label: m.tagNeedsAttention, href: "/assets" },
      ]);
    case "channels":
      return pick([{ count: shell.channels.degraded, tone: "danger", label: ch.chainDegraded, href: "/channels" }]);
    case "pipeline":
      return pick([
        { count: shell.pipeline.failedResident, tone: "danger", label: m.pipeFailed, href: "/pipeline/tasks" },
        { count: shell.pipeline.pending, tone: "warning", label: m.pipePending, href: "/pipeline/tasks" },
      ]);
    default:
      return pick([
        { count: shell.evaluation.gaps, tone: "danger", label: ev.gapsLabel, href: "/evaluation" },
        // 待复验有自己的队列页,所以这一条指得比域首页更准。
        { count: shell.evaluation.stale, tone: "warning", label: f.verification("stale").label, href: "/evaluation/queue" },
      ]);
  }
}

/**
 * 标题旁边那个警示胶囊。
 *
 * `linked` 默认关:导航栏那一行整行已经是一个 `<Link>`,在里面再套一个 `<a>` 是非法
 * HTML,水合时会出问题。首页的卡片标题不是链接的一部分,所以那里开着。
 */
export function DomainTag({
  itemKey,
  shell,
  linked = false,
}: {
  itemKey: string;
  shell: ShellData | null;
  linked?: boolean;
}) {
  const m = useMessages(shellMessages);
  const ch = useMessages(channelMessages);
  const ev = useMessages(evalMessages);
  const f = useFormat();
  if (!shell) return null;
  const signal = signalFor(itemKey, shell, m, ch, ev, f);
  if (!signal) return null;

  const badge = (
    <StatusBadge
      tone={signal.tone}
      icon={signal.tone === "danger" ? "warning" : "help"}
      aria-label={`${signal.label} ${signal.count}`}
      className="shrink-0 tabular-nums"
    >
      {signal.count}
    </StatusBadge>
  );

  return linked ? (
    <Link
      href={signal.href}
      title={`${signal.label} ${signal.count}`}
      className="shrink-0 transition-opacity duration-fast ease-standard hover:opacity-80"
    >
      {badge}
    </Link>
  ) : (
    badge
  );
}

// --- 四个域各自的统计区 -------------------------------------------------------
//
// 每个域一个函数,**各选各的形式**;共用的是上面那几个原语和外面那个框架。
// 每个函数开头一句话说明「为什么是这个形式」——那是这里唯一的判断,排版不是。

function OverviewBody({ o, m, f, a }: { o: ShellData["overview"]; m: Msgs; f: Fmt; a: AsMsgs }) {
  // 两个维度,一张图。
  //
  // 计数而不是份额:资产与知识谁也不是谁的一部分,画饼会凭空造出一个不存在的「总量」。
  // 所以两个数各自当大数摆出来,下面那张分布图把它们**联系起来**——一根条一个资产
  // (资产维度),条长是它装着多少知识(知识维度)。
  //
  // 健康构成不在这里再画一遍:标题旁边那个徽章已经说了「需关注 4」,而同一件事画两次
  // 会让人以为是两件事。
  const rows = [
    ...o.topAssets.map((t) => ({ name: t.name, value: t.entries, text: f.compact(t.entries) })),
    ...(o.restCount > 0
      ? [{ name: a.restAssets(o.restCount), value: o.rest, text: f.compact(o.rest), muted: true }]
      : []),
  ];
  return (
    <>
      <span className="flex items-stretch gap-lg">
        <span className="flex flex-col gap-3xs">
          <span className="font-mono text-title-xl leading-[1.1] tabular-nums text-foreground">
            {f.compact(o.entryCount)}
          </span>
          <span className="text-body-sm text-muted-foreground">{m.ringEntries}</span>
        </span>
        <span className="w-px shrink-0 bg-border" />
        <span className="flex flex-col gap-3xs">
          <span className="font-mono text-title-xl leading-[1.1] tabular-nums text-foreground">
            {f.compact(o.assetCount)}
          </span>
          <span className="text-body-sm text-muted-foreground">{m.ringAssets}</span>
        </span>
        {o.weeklyNew > 0 && (
          <span className="ml-auto self-start">
            <Pill text={`+${f.compact(o.weeklyNew)}`} tone="success" />
          </span>
        )}
      </span>
      {rows.length > 0 ? <DistBars rows={rows} /> : null}
    </>
  );
}

function ChannelsBody({ c, m, ch, f }: { c: ShellData["channels"]; m: Msgs; ch: ChMsgs; f: Fmt }) {
  // 份额:一个总量分给两条通道,这正是环形擅长的唯一一件事。总数放进环心,
  // 省掉一次视线移动;两条通道的份额值得读出来,所以配完整图例而不是紧凑片。
  const slices: Slice[] = [
    { label: ch.viaDirect, value: c.directCalls, tone: "brand" },
    { label: ch.viaRunos, value: c.runosCalls, tone: "ai" },
  ];
  return (
    <>
      <Headline
        value={f.compact(c.todayCalls)}
        label={ch.callsToday}
        aside={
          <Pill
            text={`${c.deltaPct >= 0 ? "▲" : "▼"}${Math.abs(c.deltaPct)}%`}
            tone={c.deltaPct >= 0 ? "success" : "danger"}
          />
        }
      />
      <span className="flex items-center gap-lg">
        <Ring slices={slices} center={f.compact(c.directCalls + c.runosCalls)} caption={m.ringTotal} />
        <Legend slices={slices} />
      </span>
      {/* 在服务谁 —— 首页三问的第二问。这张卡此前只回答了「有多少调用、走哪条通道」,
          而量和通道都不是「谁」。**一行,不换行**:卡片高度以知识资产那张为上限
          (owner 2026-08-29),排不下就少列一个,不是把卡撑高。 */}
      {c.topConsumers.length > 0 && (
        <span className="flex items-baseline gap-sm border-t border-dashed border-primary/[0.08] pt-sm dark:border-primary/15">
          <span className="shrink-0 text-body-sm text-muted-foreground">{ch.servingNow}</span>
          <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-md overflow-hidden">
            {c.topConsumers.map((p) => (
              <span key={p.code} className="flex items-baseline gap-2xs">
                <span className="text-body-sm text-ai-text">{p.code}</span>
                <span className="font-mono text-code-sm tabular-nums text-muted-foreground">{f.compact(p.calls)}</span>
              </span>
            ))}
          </span>
        </span>
      )}
    </>
  );
}

function PipelineBody({ p, m, f }: { p: ShellData["pipeline"]; m: Msgs; f: Fmt }) {
  // 构成:手上还剩多少,分成三种状态。分段条比饼好读——三段的长短可以直接比,
  // 而三块扇形要绕着圈比。主数给今日完成(产出),队列的构成在条上。
  const slices: Slice[] = [
    { label: m.pipeInflight, value: p.inflight, tone: "brand" },
    { label: m.pipePending, value: p.pending, tone: "warning" },
    { label: m.pipeFailed, value: p.failedResident, tone: "danger" },
  ];
  return (
    <>
      <Headline
        value={f.compact(p.docsToday)}
        label={m.doneToday}
        aside={p.rebuilding > 0 ? <Pill text={`${m.rebuilding} ${p.rebuilding}`} tone="warning" /> : undefined}
      />
      <span className="flex flex-col gap-2xs">
        <SegBar slices={slices} />
        <Chips slices={slices} />
      </span>
    </>
  );
}

function EvaluationBody({ e, m, ev, f }: { e: ShellData["evaluation"]; m: Msgs; ev: EvMsgs; f: Fmt }) {
  // 比率:这个域存在就是为了把它推向 100%。所以画进度条,**空轨就是还没做的部分**
  // ——那段空白本身是信息,饼图里它只是第三块颜色,读不出「还差这么多」。
  const slices: Slice[] = [
    { label: f.verification("verified").label, value: e.verified, tone: "success" },
    { label: f.verification("stale").label, value: e.stale, tone: "warning" },
    { label: f.verification("unverified").label, value: e.unverified, tone: "muted" },
  ];
  return (
    <>
      <Headline
        value={`${e.coveragePct}%`}
        label={m.verifyCoverage}
        aside={e.gaps > 0 ? <Pill text={`${ev.gapsLabel} ${e.gaps}`} tone="danger" /> : undefined}
      />
      <span className="flex flex-col gap-2xs">
        <SegBar slices={slices} />
        <Chips slices={slices} />
      </span>
    </>
  );
}

// --- 一张完整的卡 -------------------------------------------------------------

/**
 * 首页的一张域卡片。三个区一次给全,所以四张卡不可能在结构上分家。
 *
 * 卡由**渐变**承载而不是描边(owner 2026-08-24):面从上到下淡下去,靠光与地分开,
 * 发丝线收到一声耳语。
 */
export function DomainCard({ item, shell }: { item: DomainNavItem; shell: ShellData | null }) {
  const m = useMessages(shellMessages);
  const ch = useMessages(channelMessages);
  const ev = useMessages(evalMessages);
  const a = useMessages(assetMessages);
  const c = useMessages(commonMessages);
  const f = useFormat();


  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-primary/[0.06] bg-gradient-to-b from-card/80 to-card/30 transition-colors duration-fast ease-standard hover:border-primary/25 dark:border-primary/10">
      {/* ① 标题区。图标独占两行(items-start + 与两行等高),标题与说明左对齐。 */}
      <div className="flex items-start gap-sm px-lg pt-lg">
        <span className="flex size-control-lg shrink-0 items-center justify-center rounded-lg bg-primary/[0.08] text-primary">
          <Icon name={item.icon} size="md" />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-3xs">
          <span className="flex items-center gap-xs">
            {/* 标题放大一档(title-md):它是这张卡的名字,原来的 title-sm 被下面的
                数字压过去了。 */}
            <Link href={item.href} className="min-w-0 truncate text-title-md hover:text-primary-text">
              {m[item.labelKey]}
            </Link>
            <DomainTag itemKey={item.key} shell={shell} linked />
          </span>
          <span className="text-body-sm text-muted-foreground">{m[item.descKey]}</span>
        </span>
      </div>

      {/* ② 统计区。**形式按域分派**,不是四张卡套同一个图:份额用环、构成用分段条、
          比率用进度条、计数就是计数(owner 2026-08-28 第二轮——上一版全做成饼图是
          矫枉过正)。共用的是上面那几个原语和这个框架。 */}
      <div className="flex flex-1 flex-col gap-lg px-lg py-lg">
        {!shell ? (
          // 与落定后等高,避免数据到达时整页跳一下。
          <span className="flex h-[7.5rem] items-center text-body-md text-muted-foreground">{m.paneLoading}</span>
        ) : item.key === "overview" ? (
          <OverviewBody o={shell.overview} m={m} f={f} a={a} />
        ) : item.key === "channels" ? (
          <ChannelsBody c={shell.channels} m={m} ch={ch} f={f} />
        ) : item.key === "pipeline" ? (
          <PipelineBody p={shell.pipeline} m={m} f={f} />
        ) : (
          <EvaluationBody e={shell.evaluation} m={m} ev={ev} f={f} />
        )}
      </div>

      {/* ③ 操作区。左边是这个域的重点详情入口,右边永远是「进入」。
          左边为空是诚实的结果而不是遗漏:入口清单来自 `nav.ts` 的 `sub`,首页不另写
          一份——知识资产此刻没有二级视图,那就什么都不摆。 */}
      <div className="flex items-center gap-md border-t border-dashed border-primary/[0.08] px-lg py-sm dark:border-primary/15">
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-md">
          {(item.sub ?? []).map((sv) => (
            <Link
              key={sv.key}
              href={sv.href}
              className="text-body-sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-primary-text"
            >
              {m[sv.labelKey]}
            </Link>
          ))}
        </span>
        <Link
          href={item.href}
          className="flex shrink-0 items-center gap-2xs text-body-sm text-primary-text transition-colors duration-fast ease-standard hover:text-primary"
        >
          {c.enter}
          <Icon name="chevron-right" size="xs" />
        </Link>
      </div>
    </section>
  );
}
