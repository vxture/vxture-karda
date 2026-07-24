// The processing task queue (110-processing 3): three tiers with independent
// concurrency, an org-level cap, and a per-KB serial window. Pure logic over an
// in-memory queue - the port swaps to Redis later without changing the worker.
//
// The tiers exist so bulk (backfill, rebuild, instantiation) can never starve an
// interactive upload: each tier draws from its own pool, and the scheduler
// prefers interactive > sync > bulk when picking the next runnable task.
import { QUEUE_TIERS, type QueueTier } from "./stages";

export interface Task {
  /** Idempotency key (stages.taskKey). Same key = same work; enqueue dedups. */
  key: string;
  docId: string;
  kbId: string;
  /** org for the org-level concurrency cap. */
  org: string;
  tier: QueueTier;
  /** transient attempts already made - the failure decision reads this. */
  attempt: number;
  /** when this task becomes runnable (ms epoch); a backoff/suspend sets it ahead. */
  runAfter: number;
  suspended: boolean;
}

export interface EnqueueInput {
  key: string;
  docId: string;
  kbId: string;
  org: string;
  tier: QueueTier;
  attempt?: number;
  runAfter?: number;
}

/**
 * In-memory task queue with the scheduling rules. `now` is passed in so runnable
 * selection and backoff are testable without wall-clock.
 */
export class TaskQueue {
  private tasks = new Map<string, Task>(); // key -> task
  private runningByOrg = new Map<string, number>();
  private runningByKb = new Set<string>(); // kb ids with a task in flight (serial window)

  constructor(
    private orgConcurrencyCap = 4,
    private globalConcurrency = 8,
  ) {}

  /** Enqueue, deduping by key. Returns false if the key is already queued. */
  enqueue(input: EnqueueInput): boolean {
    if (this.tasks.has(input.key)) return false;
    this.tasks.set(input.key, {
      key: input.key,
      docId: input.docId,
      kbId: input.kbId,
      org: input.org,
      tier: input.tier,
      attempt: input.attempt ?? 0,
      runAfter: input.runAfter ?? 0,
      suspended: false,
    });
    return true;
  }

  /**
   * Pick the next runnable task under the scheduling rules, or null. Runnable =
   * not suspended, runAfter has passed, its org is under the org cap, its KB has
   * no task in flight (serial window), and total in-flight is under the global
   * cap. Ties prefer the higher tier.
   */
  claim(now: number): Task | null {
    const running = this.runningCount();
    if (running >= this.globalConcurrency) return null;

    const candidates = [...this.tasks.values()]
      .filter(
        (t) =>
          !t.suspended &&
          t.runAfter <= now &&
          !this.runningByKb.has(t.kbId) &&
          (this.runningByOrg.get(t.org) ?? 0) < this.orgConcurrencyCap,
      )
      .sort((a, b) => tierRank(a.tier) - tierRank(b.tier) || a.runAfter - b.runAfter);

    const next = candidates[0];
    if (!next) return null;

    this.runningByOrg.set(next.org, (this.runningByOrg.get(next.org) ?? 0) + 1);
    this.runningByKb.add(next.kbId);
    return next;
  }

  /** Mark a claimed task done and remove it. */
  complete(task: Task): void {
    this.release(task);
    this.tasks.delete(task.key);
  }

  /** Re-schedule a claimed task for a transient retry with a new attempt/backoff. */
  retry(task: Task, nextAttempt: number, runAfter: number): void {
    this.release(task);
    const t = this.tasks.get(task.key);
    if (t) {
      t.attempt = nextAttempt;
      t.runAfter = runAfter;
      t.suspended = false;
    }
  }

  /** Park a claimed task (quota / capability unavailable). It stays queued but
   *  is not runnable until resumed - it never becomes `failed`. */
  suspend(task: Task): void {
    this.release(task);
    const t = this.tasks.get(task.key);
    if (t) t.suspended = true;
  }

  /** Remove a claimed task that has failed permanently. */
  fail(task: Task): void {
    this.release(task);
    this.tasks.delete(task.key);
  }

  /** Resume all suspended tasks (e.g. quota restored, or A1 shipped). */
  resumeSuspended(now: number): number {
    let n = 0;
    for (const t of this.tasks.values()) {
      if (t.suspended) {
        t.suspended = false;
        t.runAfter = now;
        n += 1;
      }
    }
    return n;
  }

  private release(task: Task): void {
    const c = (this.runningByOrg.get(task.org) ?? 1) - 1;
    if (c <= 0) this.runningByOrg.delete(task.org);
    else this.runningByOrg.set(task.org, c);
    this.runningByKb.delete(task.kbId);
  }

  runningCount(): number {
    let n = 0;
    for (const c of this.runningByOrg.values()) n += c;
    return n;
  }

  get depth(): number {
    return this.tasks.size;
  }

  suspendedCount(): number {
    let n = 0;
    for (const t of this.tasks.values()) if (t.suspended) n += 1;
    return n;
  }
}

function tierRank(t: QueueTier): number {
  return QUEUE_TIERS.indexOf(t); // interactive=0 < sync=1 < bulk=2
}
