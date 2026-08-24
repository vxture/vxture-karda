// Shared response types for GET /api/pipeline. Dependency-free so the client
// page can type-import them without dragging server modules into the bundle
// (same contract style as overview-types.ts).

/** The five steward stages (design canvas V2: 理解/萃取/编织/验证/入藏). */
export type StewardStageKey = "understand" | "extract" | "weave" | "verify" | "commit";

export interface PipelineStage {
  key: StewardStageKey;
  /** Mono kicker, e.g. "01 UNDERSTAND". */
  kicker: string;
  label: string;
  /** One-line what-this-stage-does. */
  desc: string;
  /** Headline figure, preformatted (caller owns units/locale). */
  value: string;
  /** Unit/suffix rendered after the value, e.g. "份". */
  unit: string;
  /** Secondary figure rendered beside the value (e.g. "冲突 3"). */
  aside?: string;
  /** Aside tone - warning gets the amber treatment. */
  asideTone?: "warning" | "muted";
  /** The stage the steward is currently most active in (ai top edge). */
  active?: boolean;
}

export type ProposalKind = "conflict" | "preverify" | "fix";

export interface StewardProposal {
  id: string;
  kind: ProposalKind;
  title: string;
  /** Mono tag chip, e.g. "CONFLICT". */
  tag: string;
  /** Body copy; `strong` is the emphasized recommendation fragment. */
  body: string;
  strong: string;
  secondaryAction: string;
  primaryAction: string;
}

export interface PipelineData {
  /** Docs processed today + end-to-end P95, for the page head meta. */
  docsToday: number;
  p95Seconds: number;
  /** Share of work the steward completes without a human, 0-100. */
  autoRatePct: number;
  /** 今日战报 label/value pairs (values preformatted). */
  report: { label: string; value: string; tone?: "warning" | "success" | "ai" }[];
  stages: PipelineStage[];
  proposals: StewardProposal[];
  /** Total awaiting confirmation (proposals shown may be fewer). */
  pendingTotal: number;
  /** True while figures come from the demo overlay (no pipeline schema yet). */
  demoOps: boolean;
}
