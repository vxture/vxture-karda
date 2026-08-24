import type { ReactNode } from "react";

// The unified portal page head (owner 2026-08-24, pattern approved on the
// pipeline design boards): title + description + key info + actions on ONE
// row. Left cluster is identity (title baseline-aligned with a one-line
// description), right cluster is live context (mono key figures) then the
// page's actions. Every top-level portal page opens with this - do not
// hand-roll a page head per page.
//
// Spacing note: the head carries NO outer margins; the page's section rhythm
// (flex-col gap-lg on the page root) owns vertical spacing, and the portal
// layout owns the edge padding - both are global, keep them out of here.
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
    // The head sits in its own container so the three columns share ONE top
    // edge (owner 2026-08-24): the nav card, this panel and the steward dock
    // all start at the same y and repeat the same radius, instead of a card on
    // the left facing bare text in the middle. Surface is a translucent
    // gradient - the product backdrop reads through it, the content does not
    // have to fight it.
    <div className="flex items-center justify-between gap-lg rounded-lg border border-primary/10 bg-gradient-to-b from-card/70 to-card/35 px-lg py-md dark:border-primary/20">
      <div className="flex min-w-0 items-baseline gap-md">
        <h1 className="shrink-0 text-title-lg">{title}</h1>
        {description ? (
          <span className="truncate text-body-sm text-muted-foreground">{description}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-md">
        {meta ? <span className="font-mono text-xs text-muted-foreground">{meta}</span> : null}
        {actions ? <div className="flex items-center gap-sm">{actions}</div> : null}
      </div>
    </div>
  );
}
