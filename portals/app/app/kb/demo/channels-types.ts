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
  /** live = serving, degraded = serving with warnings, off = not provisioned.
   *
   *  There is no `stateLabel` beside it. There was, authored per channel, and
   *  it carried nuance the badge had no business holding - "待注册 · 503 失败
   *  关闭" for the Runos channel - which the activation card on the same page
   *  already states in a full sentence. A label that only NAMES a state is
   *  derivable, so it is derived (from the catalog, in the reader's language);
   *  a note that says something specific stays content. */
  state: "live" | "degraded" | "off";
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
  /** Registration/promotion state on the consuming plane. Same rule as
   *  `ChannelHealth.state`: the badge names the state, the catalog supplies the
   *  word, and per-capability nuance is not smuggled into the label. */
  status: "stable" | "pending" | "unregistered";
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

/** Where a group of figures came from on THIS request - same contract as
 *  EvaluationData.sources. Sections go live one at a time, so the marker is per
 *  group; a single page-wide flag would have to lie about whichever half moved
 *  first. */
export type FigureSource = "live" | "demo";

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
  /** Per-group provenance:
   *    traffic    totals / per-channel volume+latency+errors / consumers -
   *               LIVE off karda_kb.supply_call once a DB is attached.
   *    registry   channel names, endpoints, state, the capability contract and
   *               the activation checklist - these are CONFIGURATION and a
   *               liaison state, not ledger facts. They stay authored, and that
   *               is correct, not a gap: no amount of traffic tells you whether
   *               Runos has registered the endpoint. */
  sources: { traffic: FigureSource; registry: FigureSource };
  /** True while TRAFFIC is the demo overlay. */
  demoOps: boolean;
}
