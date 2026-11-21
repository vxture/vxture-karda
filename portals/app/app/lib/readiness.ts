// Readiness reflects dependencies used by both browser and service admission.
// Redis holds shared access generations as well as RP sessions, so losing it
// cannot be described as a browser-only degradation. Atlas availability remains
// a recoverable processing condition and is not probed with paid model calls.
export type CheckOutcome = "ok" | "fail" | "off";
export type ReadyState = "ready" | "degraded" | "fail";

export interface Readiness {
  status: ReadyState;
  checks: { db: CheckOutcome; redis: CheckOutcome; storageConfig: CheckOutcome };
}

export function checkOutcome(probe: boolean | null): CheckOutcome {
  return probe === null ? "off" : probe ? "ok" : "fail";
}

// Offline development may omit dependencies. A deployed stack must configure
// DB, Redis and durable object storage; an absent dependency is reported as off
// while overall readiness fails. storageConfig validates filesystem access or
// complete OSS configuration, not a paid/network OSS request.
export function readiness(db: boolean | null, redis: boolean | null, deployed = false, storageConfig: boolean | null = null): Readiness {
  const checks = { db: checkOutcome(db), redis: checkOutcome(redis), storageConfig: checkOutcome(storageConfig) };
  const failed = db === false || redis === false
    || storageConfig === false || deployed && (db === null || redis === null || storageConfig === null);
  return { status: failed ? "fail" : "ready", checks };
}
