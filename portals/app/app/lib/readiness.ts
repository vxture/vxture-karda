// Readiness reflects dependencies used by both browser and service admission.
// Redis holds shared access generations as well as RP sessions, so losing it
// cannot be described as a browser-only degradation. Atlas availability remains
// a recoverable processing condition and is not probed with paid model calls.
export type CheckOutcome = "ok" | "fail" | "off";
export type ReadyState = "ready" | "degraded" | "fail";

export interface Readiness {
  status: ReadyState;
  checks: { db: CheckOutcome; redis: CheckOutcome };
}

export function checkOutcome(probe: boolean | null): CheckOutcome {
  return probe === null ? "off" : probe ? "ok" : "fail";
}

// Offline development may omit dependencies. A deployed stack must configure
// both; an absent dependency is reported as off while overall readiness fails.
export function readiness(db: boolean | null, redis: boolean | null, deployed = false): Readiness {
  const checks = { db: checkOutcome(db), redis: checkOutcome(redis) };
  const failed = db === false || redis === false
    || deployed && (db === null || redis === null);
  return { status: failed ? "fail" : "ready", checks };
}
