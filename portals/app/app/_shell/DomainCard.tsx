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
//   份额(两条通道)      -> 一对环形,今日与累计各一个,中心放数
//   构成(队列的三种状态)-> 分段条,段上不标百分比(条已经画了)
//   比率(验证覆盖)      -> 进度条,空轨就是还没做的部分
//   计数(资产与知识)    -> 两个大数,外加一张分布图把两维联系起来(`DistBars`)
//
// 四个 body 各选各的形式,但都从同一组原语(`SegBar` / `Ring` / `RingStat` / `Chips` /
// `DistBars` / `Headline` / `Pill`)里取,并被同一个三区框架包着。想让某张卡自成一派,得先加一个
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

/**
 * 环用的实色,比 `TONE` **饱和**。
 *
 * 我先试过给弧挂渐变(本色 -> 亮一档),结果把弧洗白了,比原来更糟——`TONE` 本身就是
 * 混了透明的色,再往亮里渐变等于二次稀释。环是这张卡上最大的一块颜色,它需要的是
 * **确信的色**,不是层次:一条 11px 宽的弧上,明暗过渡看不出来,只看得出变淡。
 *
 * 条和块继续用 `TONE`——它们面积小、并排多,浅一点才不吵。
 */
const TONE_RING: Record<keyof typeof TONE, string> = {
  brand: "color-mix(in oklab, var(--color-primary) 88%, transparent)",
  ai: "color-mix(in oklab, var(--color-ai) 80%, transparent)",
  success: "color-mix(in oklab, var(--color-success) 88%, transparent)",
  warning: "color-mix(in oklab, var(--color-warning) 88%, transparent)",
  danger: "color-mix(in oklab, var(--color-destructive) 80%, transparent)",
  muted: "color-mix(in oklab, var(--color-muted-foreground) 40%, transparent)",
};

/**
 * 环的第二档:比 `TONE_RING` 淡。
 *
 * 两个环并排时必须分得开(owner 2026-08-29),但分开的**依据不能是色相**——同一条
 * 通道在两个环里换了颜色,图例上那个点就索引不到弧了。所以:
 *
 *   色相 = 哪条通道(直供 / 能力平台),两个环一致;
 *   浓淡 = 哪个环(今日实、累计淡)。
 *
 * 这条区分正好也读得通:今日是当下,累计是过往,过往退后一步是对的。
 */
const TONE_RING_SOFT: Record<keyof typeof TONE, string> = {
  brand: "color-mix(in oklab, var(--color-primary) 42%, transparent)",
  ai: "color-mix(in oklab, var(--color-ai) 38%, transparent)",
  success: "color-mix(in oklab, var(--color-success) 42%, transparent)",
  warning: "color-mix(in oklab, var(--color-warning) 42%, transparent)",
  danger: "color-mix(in oklab, var(--color-destructive) 38%, transparent)",
  muted: "color-mix(in oklab, var(--color-muted-foreground) 22%, transparent)",
};

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
 * 第一版被 owner 判为「太 low」,三处具体的毛病:
 *
 *   1. **底轨太重** —— 与弧同宽的实心灰圈,视重和数据弧一样,读起来像三段数据;
 *      现在底轨细一半、只用一道极淡的描边,它是刻度不是内容;
 *   2. **色不够确信** —— 弧用的是和条块同一档的浅色,在这么大一块面积上显得虚。
 *      现在环有自己一档更饱和的色(`TONE_RING`)。中间试过挂渐变,把弧洗白了,更糟:
 *      `TONE` 本身已经混了透明,再往亮里渐变是二次稀释,而 11px 宽的弧上看不出明暗
 *      过渡,只看得出变淡;
 *   3. **中心太挤** —— 数字和说明字号相近,像两行文字而不是「一个数 + 它的名字」。
 *      现在数字放大、说明降为小字,层级立起来。
 *
 * 依然用描边式画法(`stroke-dasharray`)而不是扇形路径:同一半径上排布,段与段之间
 * 天然留缝,而扇形要自己算两条边的夹角。
 */
function Ring({
  slices,
  center,
  caption,
  captionClass = "text-muted-foreground",
  palette = TONE_RING,
  size = 104,
}: {
  slices: Slice[];
  center: string;
  caption: string;
  /** 环心第二行的语气色。增量放在这里,涨跌要看得出来。 */
  captionClass?: string;
  /** 用哪一档色。两个环并排时靠它分开(见 `TONE_RING_SOFT`)。 */
  palette?: Record<keyof typeof TONE, string>;
  size?: number;
}) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = sum(slices);
  const gap = 4;
  let offset = 0;
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        {/* 底轨:细一半,极淡。它是刻度,不该和数据弧一样重。 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth={stroke / 2}
          opacity={0.5}
        />
        {total > 0 &&
          slices.map((sl) => {
            const len = Math.max(0, (Math.max(0, sl.value) / total) * c - gap);
            const el = (
              <circle
                key={sl.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={palette[sl.tone]}
                strokeWidth={stroke}
                strokeLinecap="round"
                strokeDasharray={`${Math.max(0, len)} ${c}`}
                strokeDashoffset={-offset}
              />
            );
            offset += (Math.max(0, sl.value) / total) * c;
            return len > 0 ? el : null;
          })}
      </svg>
      <span className="absolute flex flex-col items-center gap-3xs">
        <span className="font-mono text-title-md leading-[1.1] tabular-nums text-foreground">{center}</span>
        {caption ? <span className={`text-body-sm leading-[1.1] ${captionClass}`}>{caption}</span> : null}
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

/**
 * 一个数 + 它的构成:小标题在上,下面是环与图例。
 *
 * 几轮下来定在这个形状,每一条都是被退回来才对的:
 *
 *   · **名字在标题位**,不在环心——它是这一块叫什么,不是一个数的注脚;
 *   · **增量在环心**,不做成药丸——它属于中心那个数(是那个数的变化),挂在外面会压到
 *     弧上;涨绿跌红,颜色顶掉了底色的作用;
 *   · **图例一行一条**:名称、数字、百分比。中间试过「数字大在上、名称小在下」的
 *     两行式,读起来散——那个句式适合两三个并列的宏观数(知识资产那张),不适合
 *     一个环的构成明细;百分比也得留着,它是这个域最该被读到的东西;
 *   · **环与图例整体垂直居中**,并留出富余的内边距。卡片高度由同行那张定,这一块
 *     不该顶在上边缘、把空白全甩到底部。
 */
function RingStat({
  slices,
  title,
  value,
  delta,
  palette = TONE_RING,
  f,
}: {
  slices: Slice[];
  title: string;
  value: string;
  delta?: { text: string; up: boolean };
  palette?: Record<keyof typeof TONE, string>;
  f: Fmt;
}) {
  const total = sum(slices);
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-md">
      <span className="text-body-md text-muted-foreground">{title}</span>
      {/* `my-auto` + 外层 `items-stretch`:两列等高,内容各自垂直居中。 */}
      <span className="my-auto flex items-center gap-lg py-sm">
        <Ring
          slices={slices}
          center={value}
          caption={delta ? delta.text : ""}
          captionClass={delta ? (delta.up ? "text-success-text" : "text-destructive-text") : ""}
          palette={palette}
          size={92}
        />
        {/* 图例**聚在右侧**,三者之间贴紧(owner 2026-08-29)。
            松的是这一组与环、与标题之间的距离,不是「通道名 / 数字 / 百分比」三者
            互相之间——把名称设成 `flex-1` 会把三者甩到一行的两头,读一条要来回扫。
            所以名称按自然宽,数字与百分比给固定窄列(对齐用),整组 `ml-auto` 靠右。 */}
        <span className="ml-auto flex flex-col gap-sm">
          {slices.map((sl) => (
            <span key={sl.label} className="flex items-baseline gap-xs">
              <span
                className="size-2xs shrink-0 translate-y-[-0.1em] rounded-full"
                style={{ background: palette[sl.tone] }}
              />
              <span className="shrink-0 text-body-sm text-muted-foreground">{sl.label}</span>
              <span className="w-[3.25rem] shrink-0 text-right font-mono text-code-md tabular-nums text-foreground">
                {f.number(sl.value)}
              </span>
              <span className="w-[2.25rem] shrink-0 text-right font-mono text-code-sm tabular-nums text-muted-foreground/70">
                {total > 0 ? Math.round((Math.max(0, sl.value) / total) * 100) : 0}%
              </span>
            </span>
          ))}
        </span>
      </span>
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

function ChannelsBody({ c, ch, f }: { c: ShellData["channels"]; ch: ChMsgs; f: Fmt }) {
  // 两个数,各带各的构成:今日一个环,累计一个环。这个域的全部意义就是「分给哪条
  // 通道」,只给两个总数会把那件事盖住(owner 2026-08-29)。
  //
  // 两个环并排还多说了一件事:累计里直供占比与今日的差,就是趋势本身。
  const today: Slice[] = [
    { label: ch.viaDirect, value: c.directCalls, tone: "brand" },
    { label: ch.viaRunos, value: c.runosCalls, tone: "ai" },
  ];
  const total: Slice[] = [
    { label: ch.viaDirect, value: c.directTotal, tone: "brand" },
    { label: ch.viaRunos, value: c.runosTotal, tone: "ai" },
  ];
  return (
    <span className="flex flex-1 items-stretch gap-lg">
      <RingStat
        slices={today}
        title={ch.callsToday}
        value={f.number(c.todayCalls)}
        delta={{ text: `${c.deltaPct >= 0 ? "▲" : "▼"}${Math.abs(c.deltaPct)}%`, up: c.deltaPct >= 0 }}
        f={f}
      />
      <span className="w-px shrink-0 self-stretch bg-border" />
      <RingStat slices={total} title={ch.callsTotal} value={f.number(c.totalCalls)} palette={TONE_RING_SOFT} f={f} />
    </span>
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
      {/* `justify-center`:卡片高度由同行那张定,内容不该顶在上边缘、把空白全甩到底部
          (owner 2026-08-29)。`py-xl` 比其余留白宽一档,让统计区与小标题、与页脚都
          隔开——松,是这一块要的。 */}
      <div className="flex flex-1 flex-col justify-center gap-lg px-lg py-xl">
        {!shell ? (
          // 与落定后等高,避免数据到达时整页跳一下。
          <span className="flex h-[7.5rem] items-center text-body-md text-muted-foreground">{m.paneLoading}</span>
        ) : item.key === "overview" ? (
          <OverviewBody o={shell.overview} m={m} f={f} a={a} />
        ) : item.key === "channels" ? (
          <ChannelsBody c={shell.channels} ch={ch} f={f} />
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
