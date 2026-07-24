// The processing pipeline's stage model (110-processing sections 2, 3, 8). Pure
// logic: the five-stage progression, the idempotency key, and the failure
// taxonomy that decides retry vs residency. No I/O - the orchestrator (orch.ts)
// drives real work through these rules, and each rule is testable in isolation.
//
// `processing` in the content state machine is a single state; here it is
// refined into five sub-stages a task advances through, so a transient failure
// can resume from where it stopped rather than restarting from fetch.

export const STAGES = ["fetch", "parse", "chunk", "embed", "commit"] as const;
export type Stage = (typeof STAGES)[number];

/** The stage after `s`, or null if `s` is the last. */
export function nextStage(s: Stage): Stage | null {
  const i = STAGES.indexOf(s);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function isTerminalStage(s: Stage): boolean {
  return s === "commit";
}

// --- idempotency key (section 3) --------------------------------------------

/**
 * Task idempotency key = (doc_id, content_hash, config_fingerprint). Two tasks
 * with the same key are the same work and must dedup; a retry carries a
 * generation so a manual re-run after a fix is a NEW task, not a dedup'd no-op
 * (section 8: "retry = new task, key includes the retry generation").
 */
export function taskKey(
  docId: string,
  contentHash: string,
  configFingerprint: string,
  retryGeneration = 0,
): string {
  return `${docId}:${contentHash}:${configFingerprint}:g${retryGeneration}`;
}

/**
 * A config fingerprint over the inputs whose change must force reprocessing:
 * the processing template, its params, and the embedding model version. Anything
 * that changes the produced index belongs here; anything that does not must not,
 * or unrelated edits would spuriously invalidate tasks.
 */
export function configFingerprint(input: {
  processingTemplateId: string | null;
  processingParams: Record<string, unknown>;
  embeddingModel: string | null;
}): string {
  // Stable stringify: sort param keys so key order does not change the print.
  const params = stableStringify(input.processingParams);
  return `${input.processingTemplateId ?? "-"}|${params}|${input.embeddingModel ?? "-"}`;
}

function stableStringify(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  const keys = Object.keys(v as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`).join(",")}}`;
}

// --- failure taxonomy (section 8) -------------------------------------------

export type FailureClass = "transient" | "permanent" | "quota";

/** Where a task lands after a failure of each class. */
export type FailureOutcome =
  | { action: "retry"; fromStage: Stage; nextGeneration: number } // transient, under the cap
  | { action: "fail" } // permanent, or transient over the retry cap
  | { action: "suspend" }; // quota - parked, resumes automatically, never `failed`

export const MAX_TRANSIENT_RETRIES = 5;

/**
 * Decide the outcome of a failure. The three classes behave differently on
 * purpose (section 8): transient retries from the stage it stopped at with
 * exponential backoff up to a cap, then becomes permanent; permanent goes
 * straight to residency without burning retries; quota suspends rather than
 * fails, because a quota-exhausted task WILL succeed later and must not need a
 * human to un-fail it.
 */
export function classifyOutcome(
  failure: FailureClass,
  stage: Stage,
  attempt: number, // transient attempts already made for this task
): FailureOutcome {
  switch (failure) {
    case "quota":
      return { action: "suspend" };
    case "permanent":
      return { action: "fail" };
    case "transient":
      return attempt < MAX_TRANSIENT_RETRIES
        ? { action: "retry", fromStage: stage, nextGeneration: attempt + 1 }
        : { action: "fail" };
  }
}

/** Exponential backoff for a transient retry, capped. Deterministic; caller adds jitter if wanted. */
export function backoffMs(attempt: number, baseMs = 1000, capMs = 60_000): number {
  return Math.min(capMs, baseMs * 2 ** attempt);
}

// --- queue tiers (section 3) ------------------------------------------------

// interactive > sync > bulk. Independent concurrency pools so bulk (backfill,
// rebuild, instantiation) never starves an interactive upload.
export const QUEUE_TIERS = ["interactive", "sync", "bulk"] as const;
export type QueueTier = (typeof QUEUE_TIERS)[number];

/** Trigger -> tier. Where a task enters is a property of why it exists. */
export function tierForTrigger(
  trigger: "upload" | "entry_submit" | "api" | "connector_sync" | "backfill" | "rebuild" | "instantiate",
): QueueTier {
  switch (trigger) {
    case "upload":
    case "entry_submit":
    case "api":
      return "interactive";
    case "connector_sync":
      return "sync";
    case "backfill":
    case "rebuild":
    case "instantiate":
      return "bulk";
  }
}
