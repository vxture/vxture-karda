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
    <div className="flex items-center justify-between gap-lg">
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
