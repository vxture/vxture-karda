import type { ReactNode } from "react";

// The unified portal page head (owner 2026-08-24, pattern approved on the
// pipeline design boards): title + description + key info + actions on ONE
// row. Left cluster is identity (title baseline-aligned with a one-line
// description), right cluster is live context (mono key figures) then the
// page's actions. Every top-level portal page opens with this - do not
// hand-roll a page head per page.
//
// Spacing note: the head carries NO outer margins. The 内容区's own section
// rhythm owns vertical spacing, and PortalShell owns the window margin and the
// content inset - both are global, keep them out of here.
export function PageHead({
  title,
  description,
  meta,
  actions,
}: {
  title: string;
  description?: string;
  /** Key figures for the page, rendered mono and muted (e.g. "12 资产 · 82%"). */
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    // The head sits in its own container so all three panes share ONE top edge
    // (owner 2026-08-24): the nav card, this panel and the 值班台 all start at
    // the same y and repeat the same radius, instead of a card on the left
    // facing bare text in the middle. Surface is a translucent gradient - the
    // product backdrop reads through it, the content does not have to fight
    // it.
    <div className="flex items-center justify-between gap-lg rounded-lg border border-primary/[0.06] bg-gradient-to-b from-card/80 to-card/30 px-lg py-md dark:border-primary/10">
      <div className="flex min-w-0 items-baseline gap-md">
        <h1 className="shrink-0 text-title-lg">{title}</h1>
        {description ? (
          <span className="truncate text-body-sm text-muted-foreground">{description}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-md">
        {meta ? <span className="font-mono text-code-sm text-muted-foreground">{meta}</span> : null}
        {actions ? <div className="flex items-center gap-sm">{actions}</div> : null}
      </div>
    </div>
  );
}
