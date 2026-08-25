"use client";

import { useEffect, useState } from "react";
import {
  Button,
  DestructiveButton,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Icon,
  Input,
  NativeSelect,
  StatusBadge,
} from "@vxture/design-system";
import {
  previewRevoke,
  type Binding,
  type ConnectorInfo,
  type Kb,
  type RevokeImpact,
} from "../../../_lib/api";
import { formatWhen } from "../../../_lib/format";

// 外部来源 - the connector framework's face.
//
// The framework, the binding lifecycle and the revoke cascade were all complete
// and had zero UI, so external intake could only be driven by an API client.
// This is the surface; it carries nothing connector-specific, because the
// framework does not either - a connector DECLARES its capabilities and this
// renders whatever it declared.
//
// TWO THINGS THIS PANEL EXISTS TO SAY OUT LOUD:
//
//   1. THE DEGRADATIONS, at bind time. A connector that cannot express deletes
//      is a compliance gap, not an inconvenience, and the framework deliberately
//      still allows binding it - which only works if the owner is told first.
//   2. WHAT REVOKE COSTS, before the click. "Are you sure?" asks a question the
//      person cannot answer. The dialog states the document count, how many of
//      them are VERIFIED, and that the source can never be bound to this library
//      again.

const STATE_META: Record<Binding["state"], { label: string; tone: "success" | "warning" | "neutral" }> = {
  active: { label: "同步中", tone: "success" },
  paused: { label: "已暂停", tone: "warning" },
  revoked: { label: "已撤销", tone: "neutral" },
};

const MODE_LABEL: Record<Binding["mode"], string> = {
  backfill: "首次回填",
  incremental: "增量同步",
};

export function BindingPanel({
  kb,
  bindings,
  connectors,
  busy,
  onCreate,
  onAction,
}: {
  kb: Kb;
  bindings: Binding[] | null;
  connectors: (ConnectorInfo & { code: string; meetsDeleteInvariant: boolean })[];
  busy: boolean;
  onCreate: (connectorCode: string, externalSourceId: string) => void | Promise<void>;
  onAction: (binding: Binding, action: "pause" | "resume" | "revoke") => void | Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [sourceId, setSourceId] = useState("");
  /** bindingId -> its revoke cost. `undefined` = still loading, `null` = the
   *  read failed. Both are surfaced as an UNKNOWN precondition rather than as a
   *  missing button: "we could not work out what this costs" is a different
   *  statement from "this costs nothing", and the reader must be able to tell. */
  const [impacts, setImpacts] = useState<Record<string, RevokeImpact | null>>({});

  const chosen = connectors.find((c) => c.code === code) ?? null;
  // Revoked bindings are terminal and cannot be acted on; they stay visible
  // because the source they occupied can never be bound again, so a list that
  // hid them would make that constraint look arbitrary when it bites.
  const live = (bindings ?? []).filter((b) => b.state !== "revoked");
  const revoked = (bindings ?? []).filter((b) => b.state === "revoked");

  useEffect(() => {
    let cancelled = false;
    for (const b of bindings ?? []) {
      if (b.state === "revoked") continue;
      previewRevoke(kb.id, b.id).then(
        (i) => !cancelled && setImpacts((prev) => ({ ...prev, [b.id]: i })),
        () => !cancelled && setImpacts((prev) => ({ ...prev, [b.id]: null })),
      );
    }
    return () => {
      cancelled = true;
    };
  }, [bindings, kb.id]);

  return (
    <div className="flex flex-col gap-md">
      <Card>
        <CardHeader>
          <CardTitle>接入外部来源</CardTitle>
          <CardDescription>
            把这个库订阅到一个外部来源。首次绑定从「回填」开始，完成后转入增量同步。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-sm">
            <NativeSelect
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label="连接器"
              wrapperClassName="w-[16rem]"
              disabled={busy || connectors.length === 0}
            >
              <option value="">选择连接器…</option>
              {connectors.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <Input
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              placeholder="来源 id（连接器侧的范围标识）"
              aria-label="外部来源 id"
              className="w-[22rem] max-w-full"
              disabled={busy}
            />
            <Button
              variant="default"
              disabled={busy || !code || !sourceId.trim()}
              onClick={() => {
                void onCreate(code, sourceId.trim());
                setSourceId("");
              }}
            >
              <Icon name="plus" />
              绑定
            </Button>
          </div>

          {connectors.length === 0 && (
            <p className="text-body-sm text-muted-foreground">目前没有可用的连接器。</p>
          )}

          {/* Section 4: degradation must be explicitly accepted, not silently
              absorbed. Shown BEFORE the bind, not in a doc nobody reads. */}
          {chosen && (
            <div className="flex flex-col gap-xs rounded-md border border-border bg-muted/30 p-sm">
              <div className="flex flex-wrap items-center gap-xs text-body-sm">
                <span className="text-muted-foreground">能力：</span>
                <Cap label={chosen.capabilities.changeDetection === "source" ? "来源自检变更" : "karda 轮询比对"} />
                <Cap label={chosen.capabilities.delivery === "notify" ? "来源可推送" : "karda 拉取"} />
                <Cap label={chosen.capabilities.fetch === "direct" ? "直传字节" : "取引用再拉取"} />
                <Cap label={chosen.capabilities.reconcile === "list" ? "可对账" : "不可对账"} />
                <Cap label={chosen.capabilities.deleteSignal === "tombstone" ? "有删除信号" : "靠缺失推断删除"} />
              </div>
              {!chosen.meetsDeleteInvariant && (
                <p className="text-body-sm text-destructive-text">
                  该连接器无法表达删除（不满足 I4）。这是合规缺口，不是使用不便——不要用它接入敏感内容。
                </p>
              )}
              {chosen.degradations.map((d) => (
                <p key={d} className="text-body-sm text-warning-text">
                  {d}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {bindings === null ? (
        <EmptyState title="正在加载绑定…" />
      ) : bindings.length === 0 ? (
        <EmptyState title="还没有外部来源" description="这个库的内容全部来自上传或 API 写入。" />
      ) : (
        <>
          {live.length > 0 && (
            <Card>
              <CardContent className="flex flex-col py-sm">
                {live.map((b) => (
                  <BindingRow
                    key={b.id}
                    binding={b}
                    connector={connectors.find((c) => c.code === b.connectorCode) ?? null}
                    busy={busy}
                    onAction={onAction}
                    impact={impacts[b.id]}
                  />
                ))}
              </CardContent>
            </Card>
          )}
          {revoked.length > 0 && (
            <Card className="opacity-70">
              <CardHeader>
                <CardTitle className="text-title-sm leading-[1]">已撤销</CardTitle>
                <CardDescription>
                  保留在这里是因为它们占着的来源标识<strong>不能</strong>再绑定到本库；隐藏它们只会让这条约束在撞上时显得莫名其妙。
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col py-sm">
                {revoked.map((b) => (
                  <BindingRow
                    key={b.id}
                    binding={b}
                    connector={connectors.find((c) => c.code === b.connectorCode) ?? null}
                    busy={busy}
                    onAction={onAction}
                    impact={impacts[b.id]}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

    </div>
  );
}

function Cap({ label }: { label: string }) {
  return <span className="rounded-sm bg-background px-xs py-3xs font-mono text-code-sm">{label}</span>;
}

function BindingRow({
  binding,
  connector,
  busy,
  onAction,
  impact,
}: {
  binding: Binding;
  connector: (ConnectorInfo & { code: string }) | null;
  busy: boolean;
  onAction: (binding: Binding, action: "pause" | "resume" | "revoke") => void | Promise<void>;
  /** undefined = still being read, null = the read failed. */
  impact: RevokeImpact | null | undefined;
}) {
  const meta = STATE_META[binding.state];
  const terminal = binding.state === "revoked";

  return (
    <div className="flex items-center gap-md border-t border-border/60 py-sm first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-sm">
          <StatusBadge tone={meta.tone} dot={false}>
            {meta.label}
          </StatusBadge>
          <span className="truncate text-body-md font-medium">{connector?.name ?? binding.connectorCode}</span>
          <span className="truncate font-mono text-code-sm text-muted-foreground">{binding.externalSourceId}</span>
        </div>
        <div className="mt-2xs flex flex-wrap items-center gap-sm text-body-sm text-muted-foreground">
          <span>{MODE_LABEL[binding.mode]}</span>
          <span>·</span>
          {/* A binding that has never synced is materially different from one
              that synced and stalled - "从未同步" says which. */}
          <span>{binding.lastSyncedAt ? `${formatWhen(binding.lastSyncedAt)} 同步` : "从未同步"}</span>
          {binding.cursor && (
            <>
              <span>·</span>
              <span className="truncate font-mono text-code-sm">游标 {binding.cursor}</span>
            </>
          )}
        </div>
      </div>

      {!terminal && (
        <div className="flex shrink-0 items-center gap-sm">
          {binding.state === "active" ? (
            <Button size="sm" disabled={busy} onClick={() => onAction(binding, "pause")}>
              暂停
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onAction(binding, "resume")}>
              恢复
            </Button>
          )}
          <DestructiveButton
            size="sm"
            confirm={{
              verb: "撤销",
              target: binding.externalSourceId,
              // Two consequences, and the SECOND is the severe one an API reader
              // would never guess: uidx_binding_kb_connector_source is unique
              // with no state predicate, so a revoked source can never be bound
              // to this library again.
              consequence: impact
                ? `${impact.documents} 份文档退出检索` +
                  (impact.verified > 0 ? `，其中 ${impact.verified} 份是已验证内容` : "") +
                  "。撤销不可逆：该来源标识不能再绑定回本库。"
                : "撤销不可逆：该来源标识不能再绑定回本库。",
              preconditions: [
                {
                  label: "已算清撤销影响",
                  met: impact != null,
                  // THREE states, not two. A failed read is not "unmet" - it is
                  // unknown, and the reader has to be able to tell those apart
                  // before they authorise something irreversible.
                  unknown: impact === undefined,
                  note: impact === null ? "影响读取失败，请重试后再撤销" : undefined,
                },
              ],
              onConfirm: () => Promise.resolve(onAction(binding, "revoke")),
            }}
          >
            撤销
          </DestructiveButton>
        </div>
      )}
    </div>
  );
}

