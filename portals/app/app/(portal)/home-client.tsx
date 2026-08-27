"use client";

import { useEffect, useState } from "react";
import { Button, Card, CardContent, EmptyState, Icon, type IconName } from "@vxture/design-system";
import { loginHref } from "../_lib/api";
import { HomeHero } from "./home-hero";
import { useMessages } from "../_i18n/useMessages";
import { home as homeMessages } from "../_i18n/messages/home";
import { shell } from "../_i18n/messages/shell";
import { common } from "../_i18n/messages/common";
import { assets } from "../_i18n/messages/assets";
import { channels } from "../_i18n/messages/channels";
import type { Readiness, ReadinessReason, ReadinessState } from "../kb/home/readiness";
import type { ShellData } from "../kb/demo/shell-types";

// 首页(150-page-architecture §2,KD-214)。
//
// 三问,按 §2.4 定的顺序:能不能用 → 在服务谁 → 可不可信。第一问占最大的面,而且是
// 唯一会说「不好」的一块——**它是这一页存在的理由**:在此之前,产品的「整体不可用」
// 状态没有任何页面会说,语料为零时资产总览显示的是一批「有库、没内容」的库,读起来
// 像没人上传东西。
//
// §2.4 的另外两条约束也照办:
//   · **不是各域数字的拼盘** —— 每个域只取一个能推动动作的数,其余留在它自己的域总览;
//   · **每一块要么正常、要么给去处** —— 说了问题却不说去哪,只是把焦虑前移。

const STATE_TONE: Record<ReadinessState, { tone: "success" | "warning" | "danger" | "neutral"; icon: IconName }> = {
  ready: { tone: "success", icon: "check" },
  degraded: { tone: "warning", icon: "warning" },
  unavailable: { tone: "danger", icon: "warning" },
  empty: { tone: "neutral", icon: "info" },
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

/** 四个板块入口。名字与职责**复用导航的**,首页不另写一份——目录测试抓到过一次
 *  重复,而重复意味着改了导航之后首页还挂着旧名。 */
const ENTRIES = [
  { href: "/assets", icon: "squares-four", labelKey: "navAssets", descKey: "navAssetsDesc" },
  { href: "/channels", icon: "plugs-connected", labelKey: "navChannels", descKey: "navChannelsDesc" },
  { href: "/pipeline", icon: "workflow", labelKey: "navPipeline", descKey: "navPipelineDesc" },
  { href: "/evaluation", icon: "list-checks", labelKey: "navEvaluation", descKey: "navEvaluationDesc" },
] as const satisfies readonly { href: string; icon: IconName; labelKey: keyof typeof shell; descKey: keyof typeof shell }[];

export function HomeClient() {
  const m = useMessages(homeMessages);
  const s = useMessages(shell);
  const c = useMessages(common);
  const a = useMessages(assets);
  const ch = useMessages(channels);

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

  return (
    <div className="flex flex-col gap-lg">
      {/* Hero:画布在下,字在上。画布 absolute 且 pointer-events-none —— 它是地,
          不是可交互的东西。 */}
      <section className="relative overflow-hidden rounded-xl border border-border bg-surface">
        <HomeHero className="pointer-events-none absolute inset-0 size-full" />
        <div className="relative flex flex-col gap-2xs px-lg py-3xl">
          <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.tagline}</span>
          <h1 className="text-title-xl">{m.title}</h1>
          <p className="max-w-[42rem] text-body-md text-muted-foreground">{m.lede}</p>
        </div>
      </section>

      {/* 第一问:能不能用。唯一会说「不好」的一块,所以它单独占一行。 */}
      <Card className="py-md">
        <CardContent className="flex flex-col gap-sm px-lg">
          <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.q1}</span>

          {failed ? (
            <p className="text-body-md text-warning-text">{m.unreachable}</p>
          ) : !readiness || !state || !tone ? (
            <p className="text-body-md text-muted-foreground">{m.loading}</p>
          ) : (
            <>
              {/* 状态只说一次。原先图标旁的标题和徽章写的是同一句话——同一句话
                  说两遍不会更醒目,只会让人以为它们是两个不同的东西。 */}
              <span className="flex items-center gap-sm">
                <Icon name={tone.icon} className={`text-${tone.tone}-text`} />
                <span className="text-title-sm">{m[STATE_KEY[state]]}</span>
              </span>

              {readiness.reason ? (
                <p className="max-w-[46rem] text-body-md text-muted-foreground">{m[REASON_KEY[readiness.reason]]}</p>
              ) : null}

              {/* 下一步。ops 的那一种**不做成链接**:它不在这个应用里,做成链接
                  点了会发现没有那一页。 */}
              {readiness.action?.kind === "ops" ? (
                <p className="text-body-sm text-muted-foreground">
                  {m.actionOps} <span className="font-mono">{readiness.action.runbook}</span>
                </p>
              ) : readiness.action?.kind === "page" ? (
                <span>
                  <Button asChild variant="outline" size="sm">
                    <a href={readiness.action.href}>
                      {readiness.action.href === "/assets/new" ? m.actionGoNew : m.actionGoTasks}
                    </a>
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
                  <span className="text-foreground">{readiness.facts.parkedUnavailable + readiness.facts.parkedQuota}</span>
                </span>
                <span>
                  {m.factFailed} <span className="text-foreground">{readiness.facts.failedResident}</span>
                </span>
              </span>
            </>
          )}
        </CardContent>
      </Card>

      {/* 第二、三问并排:各取一个能推动动作的数,不铺开。 */}
      <div className="grid gap-lg md:grid-cols-2">
        <Card className="py-md">
          <CardContent className="flex flex-col gap-2xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.q2}</span>
            <span className="font-mono text-title-lg">{domains ? domains.channels.todayCalls : "—"}</span>
            <span className="text-body-sm text-muted-foreground">{ch.callsToday}</span>
            {/* 演示口径必须标出来,而且**尤其在这一页**:第一块刚说完「当前不可用」,
                紧接着一个未标注的「今日调用 1204」会把整屏的可信度一起带走——读的人
                无法判断哪个数是真的。供给账本落地后这一行自动消失(`demoOps` 转 false)。*/}
            {domains?.demoOps ? <span className="text-body-sm text-warning-text">{a.demoNote}</span> : null}
          </CardContent>
        </Card>
        <Card className="py-md">
          <CardContent className="flex flex-col gap-2xs px-lg">
            <span className="font-mono text-code-sm tracking-widest text-muted-foreground">{m.q3}</span>
            <span className="font-mono text-title-lg">{domains ? `${domains.evaluation.coveragePct}%` : "—"}</span>
            <span className="text-body-sm text-muted-foreground">{m.q3Metric}</span>
          </CardContent>
        </Card>
      </div>

      {/* 板块入口。首页的职责到此为止:说清状态,然后把人送进去。 */}
      <div className="grid gap-lg md:grid-cols-2 xl:grid-cols-4">
        {ENTRIES.map((e) => (
          <Card key={e.href} className="py-md transition-colors hover:border-primary/40">
            <CardContent className="flex h-full flex-col gap-2xs px-lg">
              <Icon name={e.icon} className="text-primary" />
              <a href={e.href} className="text-title-sm after:absolute after:inset-0">
                {s[e.labelKey]}
              </a>
              <span className="text-body-sm text-muted-foreground">{s[e.descKey]}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
