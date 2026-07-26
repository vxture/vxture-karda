// Connector capability registry (220-connector-framework section 4). A connector
// is not assumed to behave like any particular source - it DECLARES what it can
// do across five axes, and the framework adapts. Adding a connector is meant to
// be "implement the capability interface + register a code here", with no change
// to the DDL, the processing pipeline, or retrieval (the section-2 acceptance
// criterion). This module is the declaration side: pure data + pure predicates.

export type ChangeDetection = "source" | "karda";
export type Delivery = "poll" | "notify";
export type FetchMode = "direct" | "ref";
export type Reconcile = "list" | "none";
export type DeleteSignal = "tombstone" | "absence";

export interface ConnectorCapabilities {
  /** Source detects its own changes, or karda polls and diffs. */
  changeDetection: ChangeDetection;
  /** karda pulls on a schedule (the DEFAULT), or the source can push notify. */
  delivery: Delivery;
  /** Envelope carries bytes, or a short-lived ref karda fetches. */
  fetch: FetchMode;
  /** Source offers an (id, hash) list to reconcile against, or not. */
  reconcile: Reconcile;
  /** Explicit delete events, or deletes inferred from absence in a reconcile. */
  deleteSignal: DeleteSignal;
}

export interface ConnectorDescriptor {
  code: string; // connector_code (document.connector_code, binding.connector_code)
  name: string;
  capabilities: ConnectorCapabilities;
}

// The registry. Arda is the FIRST connector, not a privileged peer (section 10):
// its capabilities are just one row here. notify/source/ref/list/tombstone is
// Arda's declaration - a plain external doc library would more typically be
// poll/karda/direct/none/absence.
export const CONNECTORS: ConnectorDescriptor[] = [
  {
    code: "arda",
    name: "Arda knowledge channel",
    capabilities: {
      changeDetection: "source",
      delivery: "notify",
      fetch: "ref",
      reconcile: "list",
      deleteSignal: "tombstone",
    },
  },
];

const BY_CODE = new Map(CONNECTORS.map((c) => [c.code, c]));

export function connectorByCode(code: string): ConnectorDescriptor | null {
  return BY_CODE.get(code) ?? null;
}

export function isKnownConnector(code: string): boolean {
  return BY_CODE.has(code);
}

/**
 * The accepted trade-offs of a capability set, stated rather than tucked away
 * (section 4: "degradation must be explicitly accepted, not silently absorbed").
 * The product surface should show these to an owner before they bind a source.
 */
export function degradations(caps: ConnectorCapabilities): string[] {
  const out: string[] = [];
  if (caps.changeDetection === "karda") {
    out.push("karda polls this source; incremental latency is bounded by the poll interval.");
  }
  if (caps.reconcile === "none") {
    out.push("no periodic reconcile - long-running drift can only be recovered by a full reload.");
  }
  if (caps.deleteSignal === "absence") {
    out.push(
      caps.reconcile === "list"
        ? "deletes are only found by full-list reconcile (I4's weakest form) - unsuitable for sensitive sources."
        : "deletes CANNOT be detected (absence signal with no reconcile) - I4 is unmet; do not bind sensitive content.",
    );
  }
  return out;
}

/**
 * A connector that can neither be told of deletes nor reconcile to find them
 * violates invariant I4 (delete-expressible) - a compliance gap, not a UX one.
 * The framework still allows binding it (KD-013) but the caller must surface it.
 */
export function meetsDeleteInvariant(caps: ConnectorCapabilities): boolean {
  return caps.deleteSignal === "tombstone" || caps.reconcile === "list";
}
