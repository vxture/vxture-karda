"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { Button, Icon, ShellIconButton } from "@vxture/design-system";
import type { ShellData } from "../kb/demo/shell-types";
import { useMessages } from "../_i18n/useMessages";
import { shell as shellMessages } from "../_i18n/messages/shell";
import type { StewardProposal } from "../kb/demo/pipeline-types";

// 智枢 (agent hub) - the right pane of the shell body: the cross-page
// DECISION queue, nothing else (page-specific explanatory cards stay in the
// 内容区). Human acts, or hands the item to the steward. Collapses INTO the
// 顶栏: when closed the header's ai icon carries the red pending badge and
// reopens it. Shell vocabulary is defined once at the top of NavPane.tsx.
//
// TYPOGRAPHY: DS roles only, 14px baseline (`*-md` tier), same rule as the
// 导航栏 - see the note at the top of NavPane.tsx for why (font-size
// preference only moves the roles) and for the `leading-none` trap.
// 12px (`*-sm` / `text-overline`) is reserved for badges and section eyebrows.
//
// Frame (owner 2026-08-25): a 400px pane with a FIXED head and a FIXED foot -
// the identity line and the one bulk action never scroll away - and a
// scrolling middle of collapsible section cards. Widened from 320px so the
// dock is a working surface rather than a summary strip; the cost is paid by
// the 内容区, which loses those 80px (see 130-portal-shell.md section 3).
// Scrollbars are hidden product-wide now, so this pane no longer says so
// itself.
//
// The pane adds NO padding at its outer edge - the window margin owns that.
// Its inner sections do pad, which is a different thing: this is a surfaced
// panel, and a surface without inner padding puts text on its own border.

const OPEN_KEY = "karda-shell-dock-closed";

const TAG_CLASS: Record<StewardProposal["kind"], string> = {
  conflict: "bg-warning-muted/50 text-warning-text",
  preverify: "bg-success-muted/50 text-success-text",
  fix: "bg-primary-muted/50 text-primary-text",
};

/** One collapsible block inside the dock: eyebrow + count, body below. */
function DockSection({
  id,
  label,
  count,
  tone,
  open,
  onToggle,
  children,
}: {
  id: string;
  label: string;
  count?: number;
  tone?: string;
  open: boolean;
  onToggle: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-lg border border-primary/[0.06] bg-gradient-to-b from-card/60 to-card/20 dark:border-primary/10">
      <button
        onClick={() => onToggle(id)}
        aria-expanded={open}
        className="flex min-h-control-md items-center gap-sm px-sm text-left"
      >
        {/* text-overline IS the DS role for a tracked-out section eyebrow -
            it lands the size, the semibold and the wider tracking at once. */}
        <span className="flex-1 text-overline text-muted-foreground">{label}</span>
        {count !== undefined && (
          <span className={`font-mono text-code-md ${tone ?? "text-foreground"}`}>{count}</span>
        )}
        <Icon
          name={open ? "chevron-up" : "chevron-down"}
          size="xs"
          className="text-muted-foreground/60"
        />
      </button>
      {open && <div className="flex flex-col gap-sm px-sm pb-sm">{children}</div>}
    </div>
  );
}

export function StewardDock({ shell, onClose }: { shell: ShellData | null; onClose: () => void }) {
  const m = useMessages(shellMessages);
  const s = shell?.steward;
  const [closed, setClosed] = useState<Set<string>>(() => new Set());

  // Read after mount only - localStorage does not exist during SSR, so the
  // first frame must match the server (every section open, the default).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) setClosed(new Set(parsed));
    } catch {
      // Storage unavailable: stay with everything open.
    }
  }, []);

  const toggle = useCallback((id: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify([...next]));
      } catch {
        // Best-effort persistence only.
      }
      return next;
    });
  }, []);

  const isOpen = (id: string) => !closed.has(id);

  return (
    // A card inside the window margin, not a full-height slab clamped to the
    // browser edge: same hairline and radius as the nav cards and the page
    // head, translucent so the product backdrop carries through.
    // Fixed head / scrolling middle / fixed foot.
    <aside className="flex w-[25rem] shrink-0 flex-col overflow-hidden rounded-lg border border-primary/[0.06] bg-gradient-to-b from-card/80 to-card/35 dark:border-primary/10">
      <div className="flex shrink-0 items-center gap-sm border-b border-primary/[0.08] px-md py-sm dark:border-primary/10">
        <Icon name="sparkles" size="sm" className="text-ai-text" />
        <span className="flex min-w-0 flex-1 items-baseline gap-xs">
          <span className="truncate text-title-sm">{m.dock}</span>
          {/* 中文 tag 只在中文界面出现:英文目录里 `dockTag` 是空串,这里据此不画。
              名字本身不翻——它是产品名。 */}
          {m.dockTag ? (
            <span className="shrink-0 rounded-sm bg-primary/[0.1] px-2xs py-[1px] text-body-sm text-primary-text">
              {m.dockTag}
            </span>
          ) : null}
        </span>
        <span className="size-2xs rounded-full bg-success" aria-label={m.dockOnDuty} />
        {/* Ghost icon button, the DS shell idiom - no boxed background. */}
        <ShellIconButton icon="chevron-right" label={m.dockCollapse} onClick={onClose} />
      </div>

      {!s ? (
        <div className="flex flex-1 items-center justify-center text-body-md text-muted-foreground">
          <Icon name="spinner" size="xs" className="mr-2 animate-spin" />
          {m.dockConnecting}
        </div>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto px-md py-md">
            <DockSection
              id="pending"
              label={m.dockPending}
              count={s.pending}
              tone="text-warning-text"
              open={isOpen("pending")}
              onToggle={toggle}
            >
              {s.proposals.map((p) => {
                const warn = p.kind === "conflict";
                return (
                  <div
                    key={p.id}
                    className={`flex flex-col gap-xs rounded-lg border px-sm py-sm ${
                      warn
                        ? "border-warning-border/40 bg-gradient-to-b from-warning-muted/30 to-warning-muted/10"
                        : "border-primary/[0.08] bg-gradient-to-b from-card/50 to-card/20 dark:border-primary/10"
                    }`}
                  >
                    <span className="flex items-center gap-sm">
                      <span className={`rounded px-xs py-[1px] font-mono text-code-sm ${TAG_CLASS[p.kind]}`}>{p.tag}</span>
                      <span className="text-title-sm">{p.title}</span>
                    </span>
                    <span className="text-body-md text-muted-foreground">
                      {p.body}
                      <span className="text-foreground">{p.strong}</span>
                    </span>
                    <span className="flex gap-sm">
                      <Button variant="outline" size="sm">
                        {p.secondaryAction}
                      </Button>
                      <Button size="sm">{p.primaryAction}</Button>
                    </span>
                  </div>
                );
              })}
              {s.pending > s.proposals.length && (
                <Link href="/pipeline" className="text-center text-body-md text-primary">
                  {m.dockRest(s.pending - s.proposals.length)}
                </Link>
              )}
            </DockSection>

            {s.alert && (
              <DockSection
                id="alert"
                label={m.dockAlert}
                count={1}
                tone="text-destructive-text"
                open={isOpen("alert")}
                onToggle={toggle}
              >
                <span className="flex items-start gap-sm text-body-md text-muted-foreground">
                  <Icon name="warning" size="sm" className="mt-[2px] shrink-0 text-warning-text" />
                  <span>
                    {s.alert.text},
                    <Link href={s.alert.href} className="text-primary">
                      {m.dockGoHandle}
                    </Link>
                  </span>
                </span>
              </DockSection>
            )}

            <DockSection
              id="activity"
              label={m.dockActivity}
              open={isOpen("activity")}
              onToggle={toggle}
            >
              <div className="flex flex-col gap-sm text-body-md text-muted-foreground">
                {s.activity.map((a, i) => (
                  <span key={i} className="flex gap-sm">
                    <span className="shrink-0 font-mono text-code-md text-muted-foreground/70">{a.time}</span>
                    <span>
                      {a.agent && <span className="text-ai-text">{a.agent} </span>}
                      {a.text}
                    </span>
                  </span>
                ))}
              </div>
            </DockSection>
          </div>

          {/* Fixed foot: the one bulk action must always be reachable. */}
          <div className="shrink-0 border-t border-primary/[0.08] px-md py-sm dark:border-primary/10">
            <button className="flex w-full items-center justify-center gap-sm rounded-lg border border-ai-border/40 bg-ai-muted/30 px-md py-sm text-label-md text-ai-text transition-colors duration-fast ease-standard hover:bg-ai-muted/50">
              <Icon name="sparkles" size="sm" />
              {m.dockDelegate}
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
