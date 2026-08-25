"use client";

import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
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
  const [confirming, setConfirming] = useState<Binding | null>(null);
  const [impact, setImpact] = useState<RevokeImpact | null>(null);
  const [impactError, setImpactError] = useState(false);

  const chosen = connectors.find((c) => c.code === code) ?? null;
  // Revoked bindings are terminal and cannot be acted on; they stay visible
  // because the source they occupied can never be bound again, so a list that
  // hid them would make that constraint look arbitrary when it bites.
  const live = (bindings ?? []).filter((b) => b.state !== "revoked");
  const revoked = (bindings ?? []).filter((b) => b.state === "revoked");

  async function askRevoke(binding: Binding) {
    setConfirming(binding);
    setImpact(null);
    setImpactError(false);
    try {
      setImpact(await previewRevoke(kb.id, binding.id));
    } catch {
      // The confirmation must NOT proceed on a guess. If the cost cannot be
      // read, the dialog says so and offers no confirm button.
      setImpactError(true);
    }
  }

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
                    onAskRevoke={askRevoke}
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
                    onAskRevoke={askRevoke}
                  />
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <RevokeDialog
        binding={confirming}
        impact={impact}
        failed={impactError}
        busy={busy}
        onClose={() => setConfirming(null)}
        onConfirm={(b) => {
          void onAction(b, "revoke");
          setConfirming(null);
        }}
      />
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
  onAskRevoke,
}: {
  binding: Binding;
  connector: (ConnectorInfo & { code: string }) | null;
  busy: boolean;
  onAction: (binding: Binding, action: "pause" | "resume" | "revoke") => void | Promise<void>;
  onAskRevoke: (binding: Binding) => void;
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
          <Button size="sm" variant="destructive" disabled={busy} onClick={() => onAskRevoke(binding)}>
            撤销
          </Button>
        </div>
      )}
    </div>
  );
}

/** Revoke confirmation that STATES THE CASCADE IN ADVANCE. The batch's whole
 *  point: the consequence has always happened, it has just never been visible
 *  until after the click. */
function RevokeDialog({
  binding,
  impact,
  failed,
  busy,
  onClose,
  onConfirm,
}: {
  binding: Binding | null;
  impact: RevokeImpact | null;
  failed: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: (binding: Binding) => void;
}) {
  return (
    <AlertDialog open={binding !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="leading-[1]">撤销这个来源？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="flex flex-col gap-sm text-body-md">
              {failed ? (
                <span className="text-destructive-text">
                  无法读取撤销影响，因此不能确认。请重试；在看清后果之前不应执行不可逆操作。
                </span>
              ) : impact === null ? (
                <span className="text-muted-foreground">正在计算影响…</span>
              ) : (
                <>
                  <span>
                    <span className="font-mono">{impact.connectorCode}</span> ·{" "}
                    <span className="font-mono">{impact.externalSourceId}</span>
                  </span>
                  <span>
                    将有 <strong className="font-mono">{impact.documents}</strong> 份文档退出检索
                    {impact.verified > 0 && (
                      <>
                        ，其中 <strong className="font-mono text-warning-text">{impact.verified}</strong> 份是
                        <strong>已验证</strong>内容
                      </>
                    )}
                    。
                  </span>
                  {/* The severe half, and the one an API reader would miss. */}
                  <span className="rounded-md border border-destructive/25 bg-destructive/5 p-sm text-destructive-text">
                    撤销不可逆：该来源标识<strong>不能</strong>再绑定回本库。这不是「先退订、以后再订」。
                  </span>
                </>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          {/* No confirm button at all until the cost is known - a confirmation
              over an unknown consequence is not a confirmation. */}
          {impact !== null && !failed && (
            <AlertDialogAction
              disabled={busy}
              onClick={() => binding && onConfirm(binding)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              确认撤销
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
