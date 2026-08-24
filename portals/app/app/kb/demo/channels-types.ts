// Shared response types for GET /api/channels - the 供给通道 read model.
// Dependency-free so the client page can type-import them without dragging
// server modules into the bundle (same contract style as the other views).

/** The two supply channels: direct S2S and the Runos capability plane. */
export type ChannelKey = "direct" | "runos";

export interface ChannelHealth {
  key: ChannelKey;
  name: string;
  /** e.g. "POST /api/tools/:tool" - what a consumer actually calls. */
  endpoint: string;
  /** live = serving, degraded = serving with warnings, off = not provisioned. */
  state: "live" | "degraded" | "off";
  stateLabel: string;
  todayCalls: number;
  p95Ms: number;
  errorRatePct: number;
  /** Normalized 0-100 call series for the channel sparkline. */
  spark: number[];
}

/** A capability registered on a channel (Runos) or exposed directly. */
export interface ChannelCapability {
  id: string;
  /** e.g. "karda.kb-read". */
  code: string;
  operations: string[];
  risk: "read" | "write";
  /** Registration/promotion state on the consuming plane. */
  status: "stable" | "pending" | "unregistered";
  statusLabel: string;
  todayCalls: number;
}

/** One consumer of karda's knowledge, ranked by call volume. */
export interface ChannelConsumer {
  code: string;
  /** Which channel this agent reaches karda through. */
  via: ChannelKey;
  calls: number;
  /** Share of today's total, 0-100. */
  sharePct: number;
  topAsset: string;
}

export interface ChannelsData {
  totals: {
    todayCalls: number;
    directCalls: number;
    runosCalls: number;
    deltaPct: number;
    p95Ms: number;
  };
  channels: ChannelHealth[];
  capabilities: ChannelCapability[];
  consumers: ChannelConsumer[];
  /** Activation steps still outstanding before a channel is fully live. */
  activation: { label: string; done: boolean; note: string }[];
  demoOps: boolean;
}
