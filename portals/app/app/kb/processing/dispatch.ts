import { Pool } from "pg";
import { drain } from "./worker";
import { getProcessingRuntime, reenqueueProcessing, resetProcessingRuntime } from "./runtime";

// All automatic and internal-HTTP dispatch shares a database session lock.
// No new secret, scheduler account, environment variable or schema is needed.
let pool: Pool | undefined;
let busy = false;
export async function withProcessingLease<T>(work: () => Promise<T>): Promise<T | null> {
  if (busy || !process.env.DATABASE_URL) return null;
  busy = true;
  let locked = false;
  let broken = false;
  pool ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000, allowExitOnIdle: true });
  let client;
  try {
    client = await pool.connect();
    const onError = () => { broken = true; };
    client.on("error", onError);
    const result = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(1903240, 1) AS locked");
    locked = result.rows[0]?.locked === true;
    if (!locked) return null;
    return await work();
  } catch (error) {
    // Never leave a claimed in-memory task stuck after a failed DB operation.
    // The persisted document remains processing and will be recovered next pass.
    resetProcessingRuntime();
    throw error;
  } finally {
    try {
      if (locked && client && !broken) {
        try { await client.query("SELECT pg_advisory_unlock(1903240, 1)"); }
        catch { broken = true; }
      }
    } finally {
      client?.removeAllListeners("error");
      client?.release(broken);
      busy = false;
    }
  }
}

export async function dispatchProcessing(resume = false): Promise<{ ran: number; resumed: number; reenqueued: number }> {
  return await withProcessingLease(async () => {
    const runtime = getProcessingRuntime();
    const reenqueued = await reenqueueProcessing(runtime.queue);
    const resumed = resume ? runtime.queue.resumeSuspended(Date.now()) : 0;
    const ran = await drain(runtime, 20);
    return { ran, resumed, reenqueued };
  }) ?? { ran: 0, resumed: 0, reenqueued: 0 };
}

let started = false;
export function startProcessingDispatch(): void {
  if (started) return;
  started = true;
  let lastResume = 0;
  const pass = async () => {
    const resume = Date.now() - lastResume >= 300_000;
    try {
      const result = await dispatchProcessing(resume);
      if (resume) lastResume = Date.now();
      if (result.ran) console.info("[processing/dispatch]", result);
    } catch { console.error("[processing/dispatch] unavailable; documents retained"); }
  };
  setTimeout(() => { void pass(); }, 2000).unref();
  setInterval(() => { void pass(); }, 5000).unref();
}
