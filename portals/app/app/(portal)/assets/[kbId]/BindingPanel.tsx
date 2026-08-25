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
import type { DegradationKind } from "../../../kb/connectors/catalog";
import { useFormat } from "../../../_i18n/useFormat";
import { useMessages } from "../../../_i18n/useMessages";
import { assets } from "../../../_i18n/messages/assets";
import { common } from "../../../_i18n/messages/common";

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

// Tone is structure - a revoked binding is neutral in every language - so it
// stays a module constant. The labels moved to the catalog.
const STATE_TONE: Record<Binding["state"], "success" | "warning" | "neutral"> = {
  active: "success",
  paused: "warning",
  revoked: "neutral",
};

const STATE_LABEL_KEY = {
  active: "bindStateActive",
  paused: "bindStatePaused",
  revoked: "bindStateRevoked",
} as const satisfies Record<Binding["state"], keyof typeof assets>;

const MODE_LABEL_KEY = {
  backfill: "modeBackfill",
  incremental: "modeIncremental",
} as const satisfies Record<Binding["mode"], keyof typeof assets>;

/** Degradation codes from `kb/connectors/catalog.ts` to their catalog entries. */
const DEGRADATION_KEY = {
  pollLatency: "degPollLatency",
  noReconcile: "degNoReconcile",
  deletesByReconcileOnly: "degDeletesByReconcileOnly",
  deletesUndetectable: "degDeletesUndetectable",
} as const satisfies Record<DegradationKind, keyof typeof assets>;

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
  const m = useMessages(assets);
  const c = useMessages(common);
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
          <CardTitle>{m.bindTitle}</CardTitle>
          <CardDescription>
            {m.bindDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-sm">
            <NativeSelect
              value={code}
              onChange={(e) => setCode(e.target.value)}
              aria-label={m.connectorAria}
              wrapperClassName="w-[16rem]"
              disabled={busy || connectors.length === 0}
            >
              <option value="">{m.connectorPlaceholder}</option>
              {connectors.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </NativeSelect>
            <Input
              value={sourceId}
              onChange={(e) => setSourceId(e.target.value)}
              placeholder={m.sourceIdPlaceholder}
              aria-label={m.sourceIdAria}
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
              {m.bindButton}
            </Button>
          </div>

          {connectors.length === 0 && (
            <p className="text-body-sm text-muted-foreground">{m.noConnectors}</p>
          )}

          {/* Section 4: degradation must be explicitly accepted, not silently
              absorbed. Shown BEFORE the bind, not in a doc nobody reads. */}
          {chosen && (
            <div className="flex flex-col gap-xs rounded-md border border-border bg-muted/30 p-sm">
              <div className="flex flex-wrap items-center gap-xs text-body-sm">
                <span className="text-muted-foreground">{m.capsLabel}</span>
                <Cap label={chosen.capabilities.changeDetection === "source" ? m.capChangeSource : m.capChangeKarda} />
                <Cap label={chosen.capabilities.delivery === "notify" ? m.capDeliveryNotify : m.capDeliveryPull} />
                <Cap label={chosen.capabilities.fetch === "direct" ? m.capFetchDirect : m.capFetchRef} />
                <Cap label={chosen.capabilities.reconcile === "list" ? m.capReconcileList : m.capReconcileNone} />
                <Cap label={chosen.capabilities.deleteSignal === "tombstone" ? m.capDeleteTombstone : m.capDeleteAbsence} />
              </div>
              {!chosen.meetsDeleteInvariant && (
                <p className="text-body-sm text-destructive-text">
                  {m.deleteInvariantWarning}
                </p>
              )}
              {chosen.degradations.map((d) => (
                <p key={d} className="text-body-sm text-warning-text">
                  {m[DEGRADATION_KEY[d]]}
                </p>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {bindings === null ? (
        <EmptyState title={m.bindingsLoading} />
      ) : bindings.length === 0 ? (
        <EmptyState title={m.bindingsEmpty} description={m.bindingsEmptyDesc} />
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
                <CardTitle className="text-title-sm leading-[1]">{m.bindStateRevoked}</CardTitle>
                <CardDescription>
                  {m.revokedDescPre}
                  <strong>{m.revokedDescStrong}</strong>
                  {m.revokedDescPost}
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
  const m = useMessages(assets);
  const c = useMessages(common);
  const f = useFormat();
  const meta = { tone: STATE_TONE[binding.state], label: m[STATE_LABEL_KEY[binding.state]] };
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
          <span>{m[MODE_LABEL_KEY[binding.mode]]}</span>
          <span>·</span>
          {/* A binding that has never synced is materially different from one
              that synced and stalled - "从未同步" says which. */}
          <span>{binding.lastSyncedAt ? m.syncedWhen(f.when(binding.lastSyncedAt)) : m.neverSynced}</span>
          {binding.cursor && (
            <>
              <span>·</span>
              <span className="truncate font-mono text-code-sm">{m.cursorLabel(binding.cursor)}</span>
            </>
          )}
        </div>
      </div>

      {!terminal && (
        <div className="flex shrink-0 items-center gap-sm">
          {binding.state === "active" ? (
            <Button size="sm" disabled={busy} onClick={() => onAction(binding, "pause")}>
              {c.pause}
            </Button>
          ) : (
            <Button size="sm" disabled={busy} onClick={() => onAction(binding, "resume")}>
              {m.actResume}
            </Button>
          )}
          <DestructiveButton
            size="sm"
            confirm={{
              verb: m.actRevoke,
              target: binding.externalSourceId,
              // Two consequences, and the SECOND is the severe one an API reader
              // would never guess: uidx_binding_kb_connector_source is unique
              // with no state predicate, so a revoked source can never be bound
              // to this library again.
              consequence: impact
                ? m.revokeConsequence(impact.documents, impact.verified)
                : m.revokeConsequenceUnknown,
              preconditions: [
                {
                  label: m.revokePrecondition,
                  met: impact != null,
                  // THREE states, not two. A failed read is not "unmet" - it is
                  // unknown, and the reader has to be able to tell those apart
                  // before they authorise something irreversible.
                  unknown: impact === undefined,
                  note: impact === null ? m.revokePreconditionNote : undefined,
                },
              ],
              onConfirm: () => Promise.resolve(onAction(binding, "revoke")),
            }}
          >
            {m.actRevoke}
          </DestructiveButton>
        </div>
      )}
    </div>
  );
}

