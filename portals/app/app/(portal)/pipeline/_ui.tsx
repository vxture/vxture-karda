"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@vxture/design-system";
import type { StageDot } from "../../kb/demo/pipeline-types";

// Shared presentational bits for the pipeline sub-views (任务与队列 / 任务详情
// / 受控重建). Pure markup over DS tokens - no data fetching here.

const DOT_CLASS: Record<StageDot, string> = {
  done: "bg-success",
  active: "bg-primary",
  ai: "bg-ai",
  warn: "bg-warning",
  fail: "bg-destructive",
  todo: "bg-muted",
};

/** Five-stage progress dots (fetch/parse/chunk/embed/commit). */
export function StageDots({ dots }: { dots: readonly StageDot[] }) {
  return (
    <span className="flex shrink-0 items-center gap-xs" aria-hidden="true">
      {dots.map((d, i) => (
        <span key={i} className={`size-xs rounded-full ${DOT_CLASS[d]}`} />
      ))}
    </span>
  );
}

/** Right-rail card: title row + content, compact density. */
export function RailCard({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="py-md">
      <CardContent className="flex flex-col gap-sm px-lg">
        <div className="flex items-baseline justify-between gap-sm">
          <span className="text-label-lg">{title}</span>
          {aside ? <span className="font-mono text-[10px] text-muted-foreground">{aside}</span> : null}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

/** Label/value rows for rail cards. */
export function KVRows({ rows }: { rows: readonly [string, string][] }) {
  return (
    <div className="flex flex-col gap-xs text-body-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-md">
          <span className="shrink-0 text-muted-foreground">{k}</span>
          <span className="min-w-0 truncate text-right font-mono text-xs">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** Section heading row shared by the pipeline views. */
export function SectionRow({ title, aside }: { title: string; aside?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2 className="text-title-sm">{title}</h2>
      {aside ? <span className="text-[11px] text-muted-foreground">{aside}</span> : null}
    </div>
  );
}
