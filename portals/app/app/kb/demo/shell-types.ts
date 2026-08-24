// Shared response types for GET /api/shell - the ONE fetch the portal chrome
// (nav-rail cards, header badge, steward dock) makes. Dependency-free, same
// contract style as overview-types/pipeline-types.
import type { StewardProposal } from "./pipeline-types";

export interface ShellActivity {
  time: string;
  text: string;
  /** Agent code highlighted at the line start (purple), if any. */
  agent?: string;
}

export interface ShellData {
  /** Nav-card summaries, each carrying what its little chart needs. */
  overview: { assetCount: number; coveragePct: number };
  /** `spark` is a normalized 0-100 series for the call-volume sparkline. */
  channels: { todayCalls: number; deltaPct: number; spark: number[] };
  pipeline: { pending: number; failedResident: number; rebuilding: number; inflight: number };
  /** Steward dock payload. */
  steward: {
    pending: number;
    proposals: StewardProposal[];
    /** One-line alert with the steward's judgment, null when quiet. */
    alert: { text: string; href: string } | null;
    activity: ShellActivity[];
  };
  demoOps: boolean;
}
