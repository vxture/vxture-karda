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

/** One in-flight document task row (任务与队列 view). */
export type StageDot = "done" | "active" | "ai" | "warn" | "fail" | "todo";

export interface PipelineTask {
  id: string;
  title: string;
  /** Mono context line: 库 · 路径/模板 · 队列 (caller-composed). */
  detail: string;
  /** Five dots for fetch/parse/chunk/embed/commit. */
  dots: [StageDot, StageDot, StageDot, StageDot, StageDot];
  statusLabel: string;
  statusTone: "primary" | "ai" | "warning" | "danger" | "muted";
  /** Agent deposit via the Runos channel (purple treatment + sparkle). */
  agentDeposit?: boolean;
}

export interface QueueTier {
  key: "interactive" | "sync" | "bulk";
  label: string;
  queued: number;
  concurrency: string;
  /** Fill percent for the depth bar, 0-100. */
  pct: number;
}

export interface TasksData {
  counts: { inflight: number; suspended: number; failed: number };
  throughput: { docsToday: number; p95Seconds: number; freshnessP95Min: number; docsPerMin: number };
  queueDepth: { interactive: number; sync: number; bulk: number };
  failures: { transient: number; permanent: number; quota: number };
  /** Per-stage P95 seconds for the mini bars: fetch/parse/chunk/embed/commit. */
  stageP95: [number, number, number, number, number];
  tiers: QueueTier[];
  orgConcurrency: string;
  alert: { kbName: string; rate: string; body: string; judgment: string } | null;
  tasks: PipelineTask[];
  demoOps: boolean;
}

/** 任务详情 view. */
export interface TaskStage {
  kicker: string;
  label: string;
  state: "done" | "active" | "todo";
  /** e.g. "1.2s · 10:41:03" for done, "已运行 21.4s" for active. */
  timing?: string;
  progressPct?: number;
  desc: string;
  chips?: { label: string; tone: "muted" | "primary" | "ai" | "dim" }[];
}

export interface TaskDetail {
  id: string;
  title: string;
  /** Mono meta parts: 库 / 大小 / 来源 / 队列. */
  meta: string[];
  badge: string;
  stages: TaskStage[];
  /** [label, value] rows for the three rail cards. */
  config: [string, string][];
  configNote: string;
  lineage: [string, string][];
  lineageNote: string;
  cost: [string, string][];
  demoOps: boolean;
}

/** 受控重建 view. */
export interface RebuildData {
  active: {
    kbName: string;
    trigger: string;
    servingNote: string;
    /** Index of the current step in 声明变更/影子构建/原子切换/回退窗口. */
    stepIndex: number;
    progressPct: number;
    progressLabel: string;
    facts: string[];
  };
  switched: {
    kbName: string;
    changeNote: string;
    windowLeft: string;
    windowPct: number;
    rollbackTo: string;
  };
  instantiation: {
    title: string;
    flowNote: string;
    estimate: string;
    costNote: string;
  };
  triggers: string[];
  constraints: [string, string][];
  stewardAdvice: string;
  demoOps: boolean;
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
