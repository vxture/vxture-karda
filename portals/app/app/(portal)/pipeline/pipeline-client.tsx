"use client";

import { useEffect, useState } from "react";
import {
  Banner,
  Button,
  Card,
  CardContent,
  EmptyState,
  Icon,
  StatusBadge,
  type IconName,
} from "@vxture/design-system";
import { loginHref } from "../../_lib/api";
import { PageHead } from "../../_shell/PageHead";
import type { ReportUnit, ReportRowKey, StewardStageKey, PipelineData, ProposalKind } from "../../kb/demo/pipeline-types";
import { useMessages } from "../../_i18n/useMessages";
import { common } from "../../_i18n/messages/common";
import { pipeline as pipelineMessages } from "../../_i18n/messages/pipeline";
import { shell } from "../../_i18n/messages/shell";
import { assets } from "../../_i18n/messages/assets";

// 加工管道 client (design canvas V2 · Steward board, light-theme translation).
// Three 板块 under the unified PageHead, spaced by the layout's global gap-lg:
// steward presence (identity + 今日战报) -> 加工流水 five stage cards -> 待你
// 确认 proposal list. Figures come from GET /api/pipeline (demo overlay until
// the pipeline schema lands - the strip says so).

const PROPOSAL_META: Record<ProposalKind, { icon: IconName; tone: "warning" | "success" | "brand" }> = {
  conflict: { icon: "warning", tone: "warning" },
  preverify: { icon: "check", tone: "success" },
  fix: { icon: "edit", tone: "brand" },
};

const REPORT_TONE: Record<string, string> = {
  warning: "text-warning-text",
  success: "text-success-text",
  ai: "text-ai-text",
};

type PKey = {
  [K in keyof typeof pipelineMessages]: (typeof pipelineMessages)[K] extends { "zh-CN": string } ? K : never;
}[keyof typeof pipelineMessages];

/** The five stages: their kicker, name, blurb and unit all hang off the key.
 *  The kicker is a mono design element in English in every locale, so it is a
 *  literal here rather than a catalog entry. */
const STAGE_META: Record<StewardStageKey, { kicker: string; label: PKey; desc: PKey; unit: PKey }> = {
  understand: { kicker: "01 UNDERSTAND", label: "stageUnderstand", desc: "stageUnderstandDesc", unit: "unitDocs" },
  extract: { kicker: "02 EXTRACT", label: "stageExtract", desc: "stageExtractDesc", unit: "unitEntries" },
  weave: { kicker: "03 WEAVE", label: "stageWeave", desc: "stageWeaveDesc", unit: "unitGroups" },
  verify: { kicker: "04 VERIFY", label: "stageVerify", desc: "stageVerifyDesc", unit: "unitEntries" },
  commit: { kicker: "05 COMMIT", label: "stageCommit", desc: "stageCommitDesc", unit: "unitEntries" },
};

const UNIT_KEY: Record<ReportUnit, PKey> = {
  docs: "unitDocs",
  entries: "unitEntries",
  groups: "unitGroups",
  occurrences: "unitOccurrences",
};

const REPORT_KEY: Record<ReportRowKey, PKey> = {
  parsed: "reportParsed",
  units: "reportUnits",
  merged: "reportMerged",
  conflicts: "reportConflicts",
  preVerified: "reportPreVerified",
  reflux: "reportReflux",
};

export function PipelineClient() {
  const m = useMessages(pipelineMessages);
  const sh = useMessages(shell);
  const c = useMessages(common);
  const a = useMessages(assets);
  const [data, setData] = useState<PipelineData | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/pipeline", { cache: "no-store" })
      .then(async (res) => {
        if (res.status === 401) return setNeedsAuth(true);
        if (!res.ok) throw new Error(String(res.status));
        setData((await res.json()) as PipelineData);
      })
      .catch(() => setError(m.errLoad));
  }, []);

  if (needsAuth) {
    return (
      <div className="mx-auto flex max-w-[28rem] flex-col items-center gap-4 py-24">
        <EmptyState
          icon="lock"
          title={a.needSignIn}
          description={m.needSignInDesc}
          action={
            <Button asChild>
              <a href={loginHref("/pipeline")}>{c.signIn}</a>
            </Button>
          }
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[42rem] py-16">
        <Banner tone="danger" title={error} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-body-md text-muted-foreground">
        <Icon name="spinner" className="mr-2 animate-spin" />
        {m.loading}
      </div>
    );
  }

  return (
    <>
      <PageHead
        title={sh.navPipeline}
        description={sh.navPipelineDesc}
        meta={m.boardMeta(data.docsToday, data.p95Seconds, data.autoRatePct)}
        actions={
          <>
            {/* 二级导航(任务与队列/受控重建)在左侧导航卡下,不在这里重复 */}
            <Button variant="outline" asChild>
              <a href="/assets/new">{a.uploadButton}</a>
            </Button>
            <Button>{m.batchConfirm}</Button>
          </>
        }
      />

      {/* steward presence: identity left, 今日战报 right - the AI layer's
          face. AI tone rides the 2px top edge; foreground stays ai-text. */}
      <Card className="border-t-medium border-t-ai-border py-md">
        <CardContent className="flex flex-wrap items-center gap-lg px-lg">
          <div className="flex min-w-[16rem] items-center gap-md">
            <span className="flex size-media-xs shrink-0 items-center justify-center rounded-lg border border-ai-border/40 bg-ai-muted/40">
              <Icon name="sparkles" size="lg" className="text-ai-text" />
            </span>
            <span className="flex min-w-0 flex-col gap-2xs">
              <span className="flex items-baseline gap-sm">
                {/* 名字取自 `shell.dock` —— 它只该有一份。原来 pipeline 目录里另有一条
                    `stewardName`,两处说同一件事,迟早只改其中一份。 */}
                <span className="text-label-lg">{sh.dock}</span>
                <span className="font-mono text-code-sm tracking-widest text-ai-text">{m.stewardOnDuty}</span>
              </span>
              <span className="text-body-sm text-muted-foreground">
                {m.stewardBlurb}
              </span>
            </span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-lg">
            {data.report.map((r) => (
              <span key={r.key} className="flex flex-col gap-2xs">
                <span className="text-body-sm text-muted-foreground">{m[REPORT_KEY[r.key]]}</span>
                <span className={`font-mono text-body-sm ${r.tone ? REPORT_TONE[r.tone] : "text-foreground"}`}>
                  {r.value} <span className="text-muted-foreground">{m[UNIT_KEY[r.unit]]}</span>
                </span>
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* stage flow */}
      <div className="flex flex-col gap-md">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title-sm">{m.flowTitle}</h2>
          <span className="text-body-sm text-muted-foreground">
            {data.demoOps ? m.demoNote : ""}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-lg @min-[44rem]:grid-cols-5">
          {data.stages.map((s) => (
            <Card key={s.key} className={`py-md${s.active ? " border-t-medium border-t-ai-border" : ""}`}>
              <CardContent className="flex h-full flex-col gap-2xs px-lg">
                <span className={`font-mono text-code-sm tracking-widest ${s.active ? "text-ai-text" : "text-muted-foreground"}`}>
                  {STAGE_META[s.key].kicker}
                </span>
                <span className="text-label-lg">{m[STAGE_META[s.key].label]}</span>
                <span className="text-body-sm leading-relaxed text-muted-foreground">{m[STAGE_META[s.key].desc]}</span>
                <span className="mt-auto flex items-baseline gap-sm pt-2xs">
                  <span className="font-mono text-title-sm">{s.value}</span>
                  <span className="text-body-sm text-muted-foreground">{m[STAGE_META[s.key].unit]}</span>
                  {s.aside && (
                    <span className={`text-body-sm ${s.asideTone === "warning" ? "text-warning-text" : "text-muted-foreground"}`}>
                      {s.aside.kind === "conflicts" ? m.asideConflicts(s.aside.n) : m.asidePending(s.aside.n)}
                    </span>
                  )}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* proposals */}
      <div className="flex flex-col gap-md">
        <div className="flex items-baseline justify-between">
          <h2 className="text-title-sm">{m.pendingTitle(data.pendingTotal)}</h2>
          <span className="text-body-sm text-muted-foreground">{m.pendingHint}</span>
        </div>
        <div className="flex flex-col gap-md">
          {data.proposals.map((p) => {
            const meta = PROPOSAL_META[p.kind];
            const warn = meta.tone === "warning";
            return (
              <Card key={p.id} className={`py-md${warn ? " border-t-medium border-t-warning-border" : ""}`}>
                <CardContent className="flex items-start gap-md px-lg">
                  <span
                    className={`flex size-media-xs shrink-0 items-center justify-center rounded-lg border ${
                      warn
                        ? "border-warning-border/50 bg-warning-muted/40"
                        : meta.tone === "success"
                          ? "border-success-border/50 bg-success-muted/40"
                          : "border-primary-border/50 bg-primary-muted/40"
                    }`}
                  >
                    <Icon
                      name={meta.icon}
                      size="sm"
                      className={warn ? "text-warning-text" : meta.tone === "success" ? "text-success-text" : "text-primary-text"}
                    />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-2xs">
                    <span className="flex items-center gap-sm">
                      <span className="text-label-lg">{p.title}</span>
                      <StatusBadge tone={meta.tone} dot={false}>
                        <span className="font-mono text-code-sm tracking-wide">{p.tag}</span>
                      </StatusBadge>
                    </span>
                    <span className="text-body-sm leading-relaxed text-muted-foreground">
                      {p.body}
                      <span className="text-foreground">{p.strong}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-sm">
                    <Button variant="outline" size="sm">
                      {p.secondaryAction}
                    </Button>
                    <Button size="sm">{p.primaryAction}</Button>
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {data.pendingTotal > data.proposals.length && (
          <div className="flex justify-center">
            <a href="/pipeline" className="text-body-sm text-primary">
              {m.restLink(data.pendingTotal - data.proposals.length)}
            </a>
          </div>
        )}
      </div>
    </>
  );
}
