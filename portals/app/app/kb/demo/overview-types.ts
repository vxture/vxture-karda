// Shared response types for GET /api/overview. Kept dependency-free so the
// client page can type-import them without dragging server modules into the
// bundle.

export type AssetSource = "agent" | "platform" | "sync" | "external";
export type AssetHealth = "healthy" | "attention" | "processing" | "gap";

export interface OverviewHighlight {
  /** What kind of "live line" the card shows. */
  kind: "hot_question" | "agent_usage" | "reverify" | "gap" | "steward";
  /** The authored sentence, or null when the producer has only the FIGURE and
   *  the card should compose it in the reader's language. */
  text: string | null;
  /** Optional emphasized fragment inside the line (rendered stronger). */
  strong?: string;
  /** Optional trailing action label (renders as a link). */
  action?: string;
}

export interface OverviewAsset {
  id: string;
  name: string;
  source: AssetSource;
  /** Human label for the source, e.g. "自建 · forge" / "平台共建". */
  /** Human label for the source. AUTHORED per asset in the seed ("自建 · forge"
   *  names the agent), DERIVED on the live path - which is why it is still a
   *  string here rather than a code: the two paths genuinely differ in what
   *  they can say. The live path composes it from `source` at the call site. */
  sourceLabel: string | null;
  publishState: "private" | "ws_published" | "org_published";
  docCount: number;
  entryCount: number;
  /** Verified share of governed content, 0-100. */
  coveragePct: number;
  /** Entries/documents past their re-verification window. */
  staleCount: number;
  health: AssetHealth;
  /** 7-day citation count (ops ledger; demo overlay until the supply ledger lands). */
  heat7d: number;
  /** Normalized 0-100 series for the pulse sparkline. */
  sparkline: number[];
  /** Sparkline tone: brand, AI(agent-heavy) or warning. */
  sparkTone: "primary" | "ai" | "warning";
  topConsumers: string[];
  highlight: OverviewHighlight;
  tags: string[];
  processing?: { indexed: number; total: number; parked: number };
  stewardSuggestions: number;
}

export interface OverviewTotals {
  assetCount: number;
  entryCount: number;
  verifiedCount: number;
  coveragePct: number;
  todayCalls: number;
  directCalls: number;
  runosCalls: number;
  deltaPct: number;
  topAgents: { code: string; calls: number }[];
  steward: { preVerified: number; conflicts: number; refluxDrafts: number; pending: number };
}

export interface OverviewData {
  totals: OverviewTotals;
  assets: OverviewAsset[];
  /** True when ops figures come from the demo overlay (no supply ledger yet). */
  demoOps: boolean;
}
