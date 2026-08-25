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

import { SignInGate } from "../../_lib/ui";
import { PageHead } from "../../_shell/PageHead";
import { useFormat } from "../../_i18n/useFormat";
import { useMessages } from "../../_i18n/useMessages";
import { channels as channelMessages } from "../../_i18n/messages/channels";
import { shell } from "../../_i18n/messages/shell";

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

// Tone stays here, words come from the catalog - the same split as everywhere
// else. `METER_TONE` is keyed by the metering kind the API sends.
const METER_TONE: Record<string, "neutral" | "warning" | "info"> = {
  none: "neutral",
  per_call: "warning",
  per_doc: "info",
};

/** Only the plain-string entries: indexing the bound table with a key that
 *  might be interpolated would widen every read to `string | Function`. */
type ChKey = {
  [K in keyof typeof channelMessages]: (typeof channelMessages)[K] extends { "zh-CN": string } ? K : never;
}[keyof typeof channelMessages];

const METER_KEY: Record<string, { label: ChKey; detail: ChKey }> = {
  none: { label: "meterNone", detail: "meterNoneDetail" },
  per_call: { label: "meterPerCall", detail: "meterPerCallDetail" },
  per_doc: { label: "meterPerDoc", detail: "meterPerDocDetail" },
};

const MODE_KEY: Record<string, { label: ChKey; detail: ChKey }> = {
  obo_or_service: { label: "modeAny", detail: "modeAnyDetail" },
  obo_only: { label: "modeOboOnly", detail: "modeOboOnlyDetail" },
};

export function ToolsClient() {
  const f = useFormat();
  const m = useMessages(channelMessages);
  const sh = useMessages(shell);
  const [data, setData] = useState<ToolCatalog | null>(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    readToolCatalog().then(setData, (e) => {
      if (e instanceof ApiError && e.status === 401) return setNeedsAuth(true);
      setError(e instanceof ApiError ? f.apiError(e.status, e.code) : m.errLoadTools);
    });
  }, []);

  if (needsAuth) return <SignInGate href={loginHref("/tools")} />;

  const metered = data?.tools.filter((t) => t.metering.kind !== "none") ?? [];
  const free = data?.tools.filter((t) => t.metering.kind === "none") ?? [];

  return (
    <>
      <PageHead
        title={sh.subTools}
        description={sh.subToolsDesc}
        meta={data ? m.toolsMeta(data.tools.length, data.protocolVersion) : undefined}
        actions={
          <Button variant="outline" asChild>
            <Link href="/bench">{m.toolsToBench}</Link>
          </Button>
        }
      />

      {error && <Banner tone="danger" title={error} />}

      {data === null ? (
        <EmptyState title={m.toolsLoading} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{m.meteringTitle}</CardTitle>
              <CardDescription>
                {m.meteringLead(metered.length, free.length)}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-sm">
              {(["per_call", "per_doc", "none"] as const).map((kind) => {
                const group = data.tools.filter((t) => t.metering.kind === kind);
                if (group.length === 0) return null;
                const meta = METER_KEY[kind];
                return (
                  <div key={kind} className="flex flex-wrap items-baseline gap-sm border-t border-border/60 py-sm first:border-t-0">
                    <StatusBadge tone={METER_TONE[kind]} dot={false}>
                      {m[meta.label]}
                    </StatusBadge>
                    <span className="text-body-sm text-muted-foreground">{m[meta.detail]}</span>
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
              <CardTitle>{m.accessTitle}</CardTitle>
              <CardDescription>
                {data.sameBackendBothChannels
                  ? m.accessSameBackend
                  : m.accessTwoChannels}
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
                  <span className="text-body-sm text-muted-foreground">{m.accessAuth(c.auth)}</span>
                  <span className="text-body-sm">{c.suits}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{m.toolsListTitle}</CardTitle>
              <CardDescription>
                {m.toolsListLead("/.well-known/vxture-tools")}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col py-sm">
              {data.tools.map((t) => {
                const meter = METER_KEY[t.metering.kind];
                const mode = MODE_KEY[t.mode];
                return (
                  <div key={t.name} className="flex flex-col gap-2xs border-t border-border/60 py-sm first:border-t-0">
                    <div className="flex flex-wrap items-center gap-sm">
                      <code className="font-mono text-code-md font-medium">{t.name}</code>
                      <StatusBadge tone={METER_TONE[t.metering.kind] ?? "neutral"} dot={false}>
                        {meter ? m[meter.label] : t.metering.kind}
                      </StatusBadge>
                      {t.metering.metric && (
                        <span className="font-mono text-code-sm text-muted-foreground">{t.metering.metric}</span>
                      )}
                      {/* obo_only is a real constraint on integration design, not
                          a footnote: a service-identity agent simply cannot call
                          these, and finding that out at runtime is expensive. */}
                      <span className="text-body-sm text-muted-foreground">{mode ? m[mode.label] : t.mode}</span>
                    </div>
                    <span className="text-body-sm">{t.summary}</span>
                    <span className="text-body-sm text-muted-foreground">{mode ? m[mode.detail] : ""}</span>
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
