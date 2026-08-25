"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Banner,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusBadge,
} from "@vxture/design-system";
import { readToolCatalog, loginHref, ApiError, type ToolCatalog } from "../../_lib/api";
import { apiErrorMessage } from "../../_lib/format";
import { SignInGate } from "../../_lib/ui";
import { PageHead } from "../../_shell/PageHead";

// 工具面 - what an agent developer needs before deciding to call us.
//
// The manifest has always existed at /.well-known/vxture-tools, but that is
// tailnet-only and S2S-authenticated by design, so a browser cannot read it. The
// practical effect was that the only way to learn karda's tool surface was to
// read karda's source. This page closes that.
//
// IT LEADS WITH METERING, not with the tool list. "What will it cost me" is the
// question that decides whether a developer integrates at all, and the honest
// answer is per-tool: three of the eight meter nothing, two meter per call, two
// meter per document. Burying that under names and summaries answers the easy
// question first.

const METER_META: Record<string, { label: string; tone: "neutral" | "warning" | "info"; detail: string }> = {
  none: { label: "不计费", tone: "neutral", detail: "不产生 karda 侧计量" },
  per_call: { label: "按调用", tone: "warning", detail: "每次调用计一次" },
  per_doc: { label: "按文档", tone: "info", detail: "按写入的文档条数计" },
};

const MODE_META: Record<string, { label: string; detail: string }> = {
  obo_or_service: {
    label: "OBO 或服务身份",
    detail: "可代表某个用户调用，也可用服务身份调用",
  },
  obo_only: {
    label: "仅 OBO",
    detail: "必须代表一个真实用户——写入类工具不接受纯服务身份",
  },
};

export function ToolsClient() {
  const [data, setData] = useState<ToolCatalog | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readToolCatalog().then(setData, (e) => {
      if (e instanceof ApiError && e.status === 401) return setNeedsAuth(true);
      setError(e instanceof ApiError ? apiErrorMessage(e.status, e.code) : "工具面加载失败。");
    });
  }, []);

  if (needsAuth) return <SignInGate href={loginHref("/tools")} />;

  const metered = data?.tools.filter((t) => t.metering.kind !== "none") ?? [];
  const free = data?.tools.filter((t) => t.metering.kind === "none") ?? [];

  return (
    <>
      <PageHead
        title="工具面"
        description="Agent 可以调用的能力、计量方式与接入方式"
        meta={data ? `${data.tools.length} 个工具 · 协议 ${data.protocolVersion}` : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/bench">去检验台试问</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={error} />}

      {data === null ? (
        <EmptyState title="正在加载工具面…" />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>计量</CardTitle>
              <CardDescription>
                先看这个：{metered.length} 个工具产生计量，{free.length} 个不产生。AI 额度由平台层判定——
                karda 这边调用进来就响应，不预检、不因额度拒绝。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-sm">
              {(["per_call", "per_doc", "none"] as const).map((kind) => {
                const group = data.tools.filter((t) => t.metering.kind === kind);
                if (group.length === 0) return null;
                const meta = METER_META[kind];
                return (
                  <div key={kind} className="flex flex-wrap items-baseline gap-sm border-t border-border/60 py-sm first:border-t-0">
                    <StatusBadge tone={meta.tone} dot={false}>
                      {meta.label}
                    </StatusBadge>
                    <span className="text-body-sm text-muted-foreground">{meta.detail}</span>
                    <span className="ml-auto flex flex-wrap gap-xs">
                      {group.map((t) => (
                        <code key={t.name} className="rounded-sm bg-muted px-xs py-3xs font-mono text-code-sm">
                          {t.name}
                        </code>
                      ))}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>接入方式</CardTitle>
              <CardDescription>
                {data.sameBackendBothChannels
                  ? "两道门，同一套后端——选哪道门不改变你拿到的东西。"
                  : "两个通道。"}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-md">
              {data.channels.map((c) => (
                <div key={c.key} className="flex flex-col gap-2xs border-t border-border/60 pt-sm first:border-t-0 first:pt-0">
                  <div className="flex flex-wrap items-baseline gap-sm">
                    <span className="text-body-md font-medium">{c.name}</span>
                    <code className="rounded-sm bg-muted px-xs py-3xs font-mono text-code-sm">{c.endpoint}</code>
                  </div>
                  <span className="text-body-sm text-muted-foreground">{c.transport}</span>
                  <span className="text-body-sm text-muted-foreground">鉴权：{c.auth}</span>
                  <span className="text-body-sm">{c.suits}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>工具</CardTitle>
              <CardDescription>
                这份清单与 <code className="font-mono text-code-sm">/.well-known/vxture-tools</code>{" "}
                发的是同一份描述符，不会各说各话。
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col py-sm">
              {data.tools.map((t) => {
                const meter = METER_META[t.metering.kind];
                const mode = MODE_META[t.mode];
                return (
                  <div key={t.name} className="flex flex-col gap-2xs border-t border-border/60 py-sm first:border-t-0">
                    <div className="flex flex-wrap items-center gap-sm">
                      <code className="font-mono text-code-md font-medium">{t.name}</code>
                      <StatusBadge tone={meter?.tone ?? "neutral"} dot={false}>
                        {meter?.label ?? t.metering.kind}
                      </StatusBadge>
                      {t.metering.metric && (
                        <span className="font-mono text-code-sm text-muted-foreground">{t.metering.metric}</span>
                      )}
                      {/* obo_only is a real constraint on integration design, not
                          a footnote: a service-identity agent simply cannot call
                          these, and finding that out at runtime is expensive. */}
                      <span className="text-body-sm text-muted-foreground">{mode?.label ?? t.mode}</span>
                    </div>
                    <span className="text-body-sm">{t.summary}</span>
                    <span className="text-body-sm text-muted-foreground">{mode?.detail}</span>
                    <span className="flex flex-wrap gap-xs">
                      {t.input.map((k) => (
                        <code key={k} className="rounded-sm bg-muted px-xs py-3xs font-mono text-code-sm text-muted-foreground">
                          {k}
                        </code>
                      ))}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );
}
