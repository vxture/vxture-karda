"use client";

import Link from "next/link";
import { Button, Icon } from "@vxture/design-system";
import type { ShellData } from "../kb/demo/shell-types";
import type { StewardProposal } from "../kb/demo/pipeline-types";

// RIGHT rail of the V3 指挥台 shell: the steward's duty desk (管家值班台) -
// the cross-page DECISION queue, nothing else (page-specific explanatory
// cards stay in the content column). Human acts, or hands the item to the
// steward. Collapses INTO the header: when closed the header's ai icon
// carries the red pending badge and reopens it.

const TAG_CLASS: Record<StewardProposal["kind"], string> = {
  conflict: "bg-warning-muted/50 text-warning-text",
  preverify: "bg-success-muted/50 text-success-text",
  fix: "bg-primary-muted/50 text-primary-text",
};

export function StewardDock({ shell, onClose }: { shell: ShellData | null; onClose: () => void }) {
  const s = shell?.steward;
  return (
    <div className="flex w-[19rem] shrink-0 flex-col gap-md overflow-y-auto border-l border-primary/10 bg-card px-md py-md dark:border-primary/20">
      <div className="flex items-center gap-sm">
        <Icon name="sparkles" size="sm" className="text-ai-text" />
        <span className="flex-1 text-body-sm font-semibold">管家值班台</span>
        <span className="size-2xs rounded-full bg-success" aria-label="在岗" />
        <button
          onClick={onClose}
          aria-label="收起值班台"
          className="flex size-icon-xl items-center justify-center rounded-md text-muted-foreground transition-colors duration-fast ease-standard hover:bg-accent hover:text-foreground"
        >
          <Icon name="chevron-right" size="xs" />
        </button>
      </div>

      {!s ? (
        <div className="flex items-center justify-center py-xl text-xs text-muted-foreground">
          <Icon name="spinner" size="xs" className="mr-2 animate-spin" />
          正在接入…
        </div>
      ) : (
        <>
          <span className="font-mono text-[9.5px] tracking-widest text-muted-foreground">待你裁决 · {s.pending}</span>

          {s.proposals.map((p) => {
            const warn = p.kind === "conflict";
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-xs rounded-lg border px-md py-sm ${
                  warn ? "border-warning-border/50 bg-warning-muted/20" : "border-primary/10 dark:border-primary/20"
                }`}
              >
                <span className="flex items-center gap-sm">
                  <span className={`rounded px-xs py-[1px] font-mono text-[9px] ${TAG_CLASS[p.kind]}`}>{p.tag}</span>
                  <span className="text-xs font-semibold">{p.title}</span>
                </span>
                <span className="text-[11px] leading-relaxed text-muted-foreground">
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
            <Link href="/pipeline" className="text-center text-[11px] text-primary">
              其余 {s.pending - s.proposals.length} 项 →
            </Link>
          )}

          {s.alert && (
            <div className="flex flex-col gap-xs border-t border-dashed border-primary/10 pt-sm dark:border-primary/20">
              <span className="font-mono text-[9.5px] tracking-widest text-muted-foreground">告警 · 1</span>
              <span className="flex items-start gap-sm text-[11px] leading-relaxed text-muted-foreground">
                <Icon name="warning" size="xs" className="mt-[2px] shrink-0 text-warning-text" />
                <span>
                  {s.alert.text},<Link href={s.alert.href} className="text-primary">去处理</Link>
                </span>
              </span>
            </div>
          )}

          <div className="flex min-h-0 flex-1 flex-col gap-sm border-t border-dashed border-primary/10 pt-sm dark:border-primary/20">
            <span className="font-mono text-[9.5px] tracking-widest text-muted-foreground">Agent 活动 · 实时</span>
            <div className="flex flex-col gap-sm text-[11px] leading-relaxed text-muted-foreground">
              {s.activity.map((a, i) => (
                <span key={i} className="flex gap-sm">
                  <span className="shrink-0 font-mono text-[9.5px] text-muted-foreground/70">{a.time}</span>
                  <span>
                    {a.agent && <span className="text-ai-text">{a.agent} </span>}
                    {a.text}
                  </span>
                </span>
              ))}
            </div>
          </div>

          <button className="flex items-center justify-center gap-sm rounded-lg border border-ai-border/40 bg-ai-muted/30 px-md py-xs text-xs font-semibold text-ai-text transition-colors duration-fast ease-standard hover:bg-ai-muted/50">
            <Icon name="sparkles" size="xs" />
            低风险项全部交给管家处理
          </button>
        </>
      )}
    </div>
  );
}
