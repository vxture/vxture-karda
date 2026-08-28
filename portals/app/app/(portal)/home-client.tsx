"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Icon, type IconName } from "@vxture/design-system";
import { loginHref } from "../_lib/api";
import { HomeHero } from "./home-hero";
import { DomainCardBody, DomainTag } from "../_shell/DomainCard";
import { NAV_ITEMS } from "../_shell/nav";
import { useMessages } from "../_i18n/useMessages";
import { home as homeMessages } from "../_i18n/messages/home";
import { shell } from "../_i18n/messages/shell";
import { common } from "../_i18n/messages/common";
import { assets } from "../_i18n/messages/assets";
import type { Readiness, ReadinessReason, ReadinessState } from "../kb/home/readiness";
import type { ShellData } from "../kb/demo/shell-types";

// 首页(150-page-architecture §2,KD-214;形态 KD-215,owner 2026-08-28)。
//
// 这一页现在是**四张域卡片**,加上一条只在不正常时出现的可用性条。两条 owner 裁定
// 把它改成这样:
//
//  1. 「还不如把原来的四个导航 card 精细优化作为首页」。上一版把三问各摆一块、再在
//     下面铺四个入口卡,于是同一批数在一屏里出现两次(通道调用量既在「在服务谁」那
//     块、又在通道入口卡里),读起来密密麻麻。**卡片本身就同时回答了「怎么样」和
//     「去哪里」**——它有图、有数、有名字,不需要再在它上面另摆一份摘要。
//  2. 「可用性只在不正常时才出现」。一条常驻的绿条不携带信息:它每天都在,读的人会
//     学会跳过它,于是它变红的那一天也会被跳过。**只在 state ≠ ready 时出现的条,
//     出现本身就是信号。**
//
// 判断仍然由 `kb/home/readiness.ts` 做,这里只负责显示——「不可用」和「还没开始」必须
// 分开这件事写在那个文件里,不在这一页。

/** 每一档的图标与配色。**类名整条写死,不拼**:Tailwind 在构建期扫源码,
 *  `text-${tone}-text` 这种拼出来的类名扫不到,那个颜色会在生产构建里静默消失
 *  ——上一版的图标就是这么写的。拼接还会拼出根本不存在的令牌:`danger` 不是 DS 的
 *  色名,`destructive` 才是,所以那一档从来就没有过颜色。 */
const STATE_TONE: Record<ReadinessState, { box: string; icon: IconName; iconClass: string }> = {
  ready: { box: "border-success-border/50 bg-success-muted/40", icon: "check", iconClass: "text-success-text" },
  degraded: { box: "border-warning-border/50 bg-warning-muted/40", icon: "warning", iconClass: "text-warning-text" },
  unavailable: {
    box: "border-destructive-border/50 bg-destructive-muted/50",
    icon: "warning",
    iconClass: "text-destructive-text",
  },
  empty: { box: "border-border bg-card/60", icon: "info", iconClass: "text-muted-foreground" },
};

const STATE_KEY = {
  ready: "stateReady",
  degraded: "stateDegraded",
  unavailable: "stateUnavailable",
  empty: "stateEmpty",
} as const satisfies Record<ReadinessState, keyof typeof homeMessages>;

const REASON_KEY = {
  capability_not_granted: "reasonCapability",
  quota_exhausted: "reasonQuota",
  failures_resident: "reasonFailures",
  processing: "reasonProcessing",
  nothing_ingested: "reasonNothing",
} as const satisfies Record<ReadinessReason, keyof typeof homeMessages>;

/** 四个域,从导航目录里取——首页不另写一份。首页自己那一项要去掉,否则这一页会给出
 *  一张指向自己的卡片,而且 `DomainCardBody` 的 default 分支会把它画成验证评测。 */
const DOMAINS = NAV_ITEMS.filter((i) => i.key !== "home");

export function HomeClient() {
  const m = useMessages(homeMessages);
  const s = useMessages(shell);
  const c = useMessages(common);
  const a = useMessages(assets);

  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [domains, setDomains] = useState<ShellData | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/home", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return setNeedsAuth(true);
        if (!res.ok) throw new Error(String(res.status));
        setReadiness(((await res.json()) as { readiness: Readiness }).readiness);
      })
      .catch(() => setFailed(true));
    fetch("/api/shell", { cache: "no-store" })
      .then(async (res) => {
        if (res.ok) setDomains((await res.json()) as ShellData);
      })
      .catch(() => undefined);
  }, []);

  if (needsAuth) {
    return (
      <div className="mx-auto flex max-w-[28rem] flex-col items-center gap-4 py-24">
        <EmptyState
          icon="lock"
          title={c.signIn}
          action={
            <Button asChild>
              <a href={loginHref("/")}>{c.signIn}</a>
            </Button>
          }
        />
      </div>
    );
  }

  const state = readiness?.state ?? null;
  const tone = state ? STATE_TONE[state] : null;
  // 加载中什么都不出。先出一条再收掉会闪一下,而闪一下的告警比不出更糟:它训练人
  // 忽略这个位置。
  const showReadiness = failed || (state !== null && state !== "ready");

  return (
    <div className="flex flex-col gap-lg">
      {/* Hero:画布在下,字在上。画布 absolute 且 pointer-events-none —— 它是地,
          不是可交互的东西。比上一版矮一档:第一屏要留给卡片。 */}
      <section className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <HomeHero className="pointer-events-none absolute inset-0 size-full" />
        <div className="relative flex flex-col gap-2xs px-lg py-2xl">
          <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.tagline}</span>
          <h1 className="text-title-xl">{m.title}</h1>
          <p className="max-w-[42rem] text-body-md text-muted-foreground">{m.lede}</p>
        </div>
      </section>

      {/* 可用性:只在不正常时出现。出现 = 有事。 */}
      {showReadiness ? (
        <section
          role="status"
          className={`flex flex-col gap-2xs rounded-lg border px-lg py-md ${
            tone ? tone.box : "border-warning-border/50 bg-warning-muted/40"
          }`}
        >
          {failed ? (
            <span className="text-body-md text-warning-text">{m.unreachable}</span>
          ) : !readiness || !state || !tone ? null : (
            <>
              <span className="flex flex-wrap items-center gap-sm">
                <Icon name={tone.icon} className={tone.iconClass} />
                <span className="text-title-sm">{m[STATE_KEY[state]]}</span>
                {readiness.reason ? (
                  <span className="text-body-md text-muted-foreground">{m[REASON_KEY[readiness.reason]]}</span>
                ) : null}
              </span>

              {/* 下一步。ops 的那一种**不做成链接**:它不在这个应用里,做成链接
                  点了会发现没有那一页。 */}
              {readiness.action?.kind === "ops" ? (
                <span className="text-body-sm text-muted-foreground">
                  {m.actionOps} <span className="font-mono">{readiness.action.runbook}</span>
                </span>
              ) : /* `href` 是可选字段,这里必须一起判 —— `kind: "page"` 但没有 href 的
                     动作是无处可去的按钮,而无处可去的按钮比没有按钮更糟。 */
              readiness.action?.kind === "page" && readiness.action.href ? (
                <span className="pt-2xs">
                  <Button asChild variant="outline" size="sm">
                    <Link href={readiness.action.href}>
                      {readiness.action.href === "/assets/new" ? m.actionGoNew : m.actionGoTasks}
                    </Link>
                  </Button>
                </span>
              ) : null}

              {/* 支撑判断的数,给读的人自己复核。 */}
              <span className="flex flex-wrap gap-lg pt-2xs font-mono text-code-sm text-muted-foreground">
                <span>
                  {m.factRetrievable} <span className="text-foreground">{readiness.facts.retrievable}</span>
                </span>
                <span>
                  {m.factDocuments} <span className="text-foreground">{readiness.facts.documents}</span>
                </span>
                <span>
                  {m.factParked}{" "}
                  <span className="text-foreground">
                    {readiness.facts.parkedUnavailable + readiness.facts.parkedQuota}
                  </span>
                </span>
                <span>
                  {m.factFailed} <span className="text-foreground">{readiness.facts.failedResident}</span>
                </span>
              </span>
            </>
          )}
        </section>
      ) : null}

      {/* 四个域。卡片的图形词汇来自被退掉的导航卡(`_shell/DomainCard.tsx`),这里给
          它们**当初在 280px 宽里给不起的东西**:一行说明、成对的呼吸空间、以及把二级
          视图直接摆出来——首页的职责就是把人送进去,不该让人先进一层再找。 */}
      {/* 断点走**容器**,不走视口(先例见 `assets/assets-client.tsx`):内容区被
          `PortalShell` 标成 `@container`,而视口断点看不见 导航栏 / 值班台 开着没有
          ——`lg:` 会在 1440 两栏全开(内容区只有 38.5rem)时照样画两列,把每张卡压到
          图表读不出来的宽度。
          闸门定在 38rem:两列各约 292px,正是这套图形当初在 280px 导航栏里画的宽度
          ——已经证明能读。再窄就单列,不是把图压瘦。 */}
      <div className="grid grid-cols-1 gap-lg @min-[38rem]:grid-cols-2">
        {DOMAINS.map((item) => (
          <section
            key={item.key}
            // 卡由渐变承载,不由描边承载(owner 2026-08-24):面从上到下淡下去,靠光
            // 与地分开,发丝线收到一声耳语。
            className="flex flex-col overflow-hidden rounded-xl border border-primary/[0.06] bg-gradient-to-b from-card/80 to-card/30 transition-colors duration-fast ease-standard hover:border-primary/25 dark:border-primary/10"
          >
            <div className="flex flex-col gap-2xs px-lg pt-lg">
              <span className="flex items-center gap-xs">
                <Icon name={item.icon} size="sm" className="text-primary" />
                <Link href={item.href} className="text-title-sm hover:text-primary-text">
                  {s[item.labelKey]}
                </Link>
                <DomainTag itemKey={item.key} shell={domains} />
              </span>
              <p className="text-body-sm text-muted-foreground">{s[item.descKey]}</p>
            </div>

            {/* 图占这张卡的主体。`justify-center`:网格让同一行的卡等高,而四个域的图
                高度并不相等——不居中的话,矮的那一张会把所有余量堆在底部,看起来像
                内容没加载完。 */}
            <div className="flex flex-1 flex-col justify-center px-lg py-lg">
              <DomainCardBody item={item} shell={domains} />
            </div>

            {/* 二级视图作页脚:一条虚线之下的一排去处。 */}
            {item.sub.length > 0 ? (
              <div className="flex flex-wrap gap-md border-t border-dashed border-primary/[0.08] px-lg py-sm dark:border-primary/15">
                {item.sub.map((sv) => (
                  <Link
                    key={sv.key}
                    href={sv.href}
                    className="text-body-sm text-muted-foreground transition-colors duration-fast ease-standard hover:text-primary-text"
                  >
                    {s[sv.labelKey]}
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      {/* 演示口径只标一次,标在所有卡片之下——四张卡的数**都**来自同一个演示读模型,
          每张各标一遍是把同一句话说四遍。供给账本落地后自动消失(`demoOps` 转 false)。 */}
      {domains?.demoOps ? <p className="text-body-sm text-warning-text">{a.demoNote}</p> : null}
    </div>
  );
}
