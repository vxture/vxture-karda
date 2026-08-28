"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, EmptyState, Icon, type IconName } from "@vxture/design-system";
import { loginHref } from "../_lib/api";
import { HomeHero } from "./home-hero";
import { DomainCard } from "../_shell/DomainCard";
import { NAV_ITEMS } from "../_shell/nav";
import { useMessages } from "../_i18n/useMessages";
import { home as homeMessages } from "../_i18n/messages/home";
import { shell } from "../_i18n/messages/shell";
import { common } from "../_i18n/messages/common";
import { states } from "../_i18n/messages/states";
import { assets } from "../_i18n/messages/assets";
import type { Readiness, ReadinessReason, ReadinessState } from "../kb/home/readiness";
import type { UnavailableCause } from "../kb/processing/unavailable";
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

/** 每一档「用不了」对应的说明。四档分开,因为**修复人不同**——这是 owner 2026-08-28
 *  纠正的那件事:压成一句「模型能力尚未授权」,运维、平台、库属主三方谁都不知道
 *  该动手。 */
const BLOCKER_KEY = {
  atlas_not_configured: "blockerAtlasNotConfigured",
  workspace_not_provisioned: "blockerWorkspaceNotProvisioned",
  endpoint_not_granted: "blockerEndpointNotGranted",
  model_not_routable: "blockerModelNotRoutable",
} as const satisfies Record<UnavailableCause, keyof typeof states>;

/** 四个域,从导航目录里取——首页不另写一份。首页自己那一项要去掉,否则这一页会给出
 *  一张指向自己的卡片,而且 `DomainCardBody` 的 default 分支会把它画成验证评测。 */
const DOMAINS = NAV_ITEMS.filter((i) => i.key !== "home");

export function HomeClient() {
  const m = useMessages(homeMessages);
  const s = useMessages(shell);
  const c = useMessages(common);
  const a = useMessages(assets);
  // 「卡在哪、去哪补」那组句子在**资产页也要用**,所以放在共享的状态目录里
  // ——复制一份到 home 目录,两边的说法迟早会漂移。
  const st = useMessages(states);

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
      {/* Hero。首页的第一块,按 hero 做而不是按页头做(owner 2026-08-28)。
          分四层,自下而上:

            1. 画布      漂移的点连成图 —— 这一层就是主题本身,不是装饰
            2. 光晕      左上一团品牌色径向光。**它解决的是一个真问题**:字压在图线上
                         读不清,给字一块「地」比把图调淡好,后者会让主题消失
            3. 渐隐边    四周向内收的暗角,让图**淡出**而不是被边框切断
            4. 字        眉标 / 字标 / 导语,依次升起

          字标用 `em` 相对角色放大,不写死 px:DS 最大的角色是 `title-xl`,而 hero 要更大
          ——写死会把用户的字号偏好冻在那个数上(04-tokens-contract),`em` 仍然跟着角色走。 */}
      <section className="relative isolate overflow-hidden rounded-xl border border-border bg-surface">
        <HomeHero className="pointer-events-none absolute inset-0 -z-10 size-full" />

        {/* 光晕。`-z-10` 之上、字之下;`mix-blend` 不用——暗色主题下会把光晕吃掉。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -left-[10%] -top-[40%] -z-10 size-[46rem] rounded-full opacity-70"
          style={{
            background:
              "radial-gradient(closest-side, color-mix(in oklab, var(--color-primary) 16%, transparent), transparent)",
          }}
        />
        {/* 渐隐边:让画布在四周淡出,而不是被 `overflow-hidden` 齐刷刷切掉。 */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(120% 90% at 30% 40%, transparent 40%, color-mix(in oklab, var(--color-surface) 85%, transparent) 100%)",
          }}
        />

        <div className="relative flex flex-col gap-sm px-2xl py-4xl">
          {/* 眉标带一道短的品牌色引线:那一道不是装饰,它把眉标钉成「定位语」这一类,
              而不是又一行说明文字。 */}
          <span className="vx-hero-rise flex items-center gap-sm" style={{ animationDelay: "40ms" }}>
            <span className="h-[2px] w-lg shrink-0 rounded-full bg-primary/60" />
            <span className="font-mono text-code-sm tracking-[0.3em] text-muted-foreground">{m.tagline}</span>
          </span>

          {/* 字标。`leading-[1.05]` 而不是 `leading-none` —— 后者在 DS 下等于
              line-height:0(spacing 命名空间回落),整块会渲染成空白。 */}
          <h1
            className="vx-hero-rise text-title-xl leading-[1.05] tracking-tight"
            style={{ animationDelay: "140ms" }}
          >
            <span className="text-[2.6em] font-semibold text-foreground">{m.title}</span>
          </h1>

          <p
            className="vx-hero-rise max-w-[44rem] text-body-lg text-muted-foreground"
            style={{ animationDelay: "260ms" }}
          >
            {m.lede}
          </p>
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
                {/* 有具体清单时**不再重复那句笼统话**——「模型能力尚未授权」后面紧跟
                    两条「某端点未授权给产品 karda」,是同一句说两遍,而更精确的那一份
                    已经在下面。清单为空(库里是改判之前的旧记录)时它才是唯一的说法。 */}
                {readiness.reason && readiness.blockers.length === 0 ? (
                  <span className="text-body-md text-muted-foreground">{m[REASON_KEY[readiness.reason]]}</span>
                ) : null}
              </span>

              {/* 具体卡在哪几件事上。**这一段才是能让人动手的部分**:上面那句只说了
                  「用不了」,这里说是哪一种、缺的是哪个端点/模型、谁在哪补。
                  空的时候什么都不出——库里可能还有改判之前写下的旧记录,解不出来
                  就退回上面那句笼统的话,含糊好过指错方向。 */}
              {readiness.blockers.length > 0 ? (
                <ul className="flex flex-col gap-2xs pt-2xs">
                  {readiness.blockers.map((b) => (
                    <li key={`${b.cause}:${b.arg ?? ""}`} className="text-body-md">
                      {b.arg ? <code className="font-mono text-code-md text-foreground">{b.arg}</code> : null}
                      <span className={b.arg ? "ml-xs text-muted-foreground" : "text-muted-foreground"}>
                        {st[BLOCKER_KEY[b.cause]]}
                      </span>
                    </li>
                  ))}
                  <li className="text-body-sm text-muted-foreground">{st.blockerResumeNote}</li>
                </ul>
              ) : null}

              {/* 下一步。ops 的那一种**不做成链接**:它不在这个应用里,做成链接
                  点了会发现没有那一页。 */}
              {readiness.action?.kind === "ops" ? (
                <span className="text-body-sm text-muted-foreground">
                  {/* 「这件事要运维做」在有清单时是**错的**:上面每一条已经点名了自己的
                      修复人(平台管理面 / 平台 / 运维 / 库属主),而这四个并不都是运维。
                      有清单时只留「操作单」这个指针,不再替它们认领执行方。 */}
                  {readiness.blockers.length === 0 ? m.actionOps : m.actionRunbook}{" "}
                  <span className="font-mono">{readiness.action.runbook}</span>
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

      {/* 四个域。**整张卡由 `DomainCard` 渲染**——三个区(标题 / 统计 / 操作)一次给全,
          首页这里不再逐块拼。改版前是在这里拼的,于是四张卡的标题字号、留白、数字摆法
          各漂各的,统计区尤其不像话(owner 2026-08-28)。一个形状四份数据,想让它们分家
          得先改那一份渲染。

          断点走**容器**,不走视口(先例见 `assets/assets-client.tsx`):内容区被
          `PortalShell` 标成 `@container`,而视口断点看不见 导航栏 / 智枢 开着没有
          ——`lg:` 会在 1440 两栏全开(内容区只有 38.5rem)时照样画两列,把每张卡压到
          图表读不出来的宽度。闸门 38rem:两列各约 292px,再窄就单列,不是把图压瘦。 */}
      <div className="grid grid-cols-1 gap-lg @min-[38rem]:grid-cols-2">
        {DOMAINS.map((item) => (
          <DomainCard key={item.key} item={item} shell={domains} />
        ))}
      </div>

      {/* 演示口径只标一次,标在所有卡片之下——四张卡的数**都**来自同一个演示读模型,
          每张各标一遍是把同一句话说四遍。供给账本落地后自动消失(`demoOps` 转 false)。 */}
      {domains?.demoOps ? <p className="text-body-sm text-warning-text">{a.demoNote}</p> : null}
    </div>
  );
}
