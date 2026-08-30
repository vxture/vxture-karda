// Short-timeout dependency probes, shared by the two surfaces that may touch
// dependencies: /api/status (config presence + reachability, gated) and
// /api/ready (readiness, 025 §2). Extracted from the status route so the two
// cannot drift into different timeout or failure semantics.
//
// /api/health must NEVER import this file - liveness is zero-dependency by
// contract (020/025), and the whole point of the split is that a dependency
// wobble can not make the container look dead.

const PROBE_TIMEOUT_MS = 1000;

export function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);
}

/** null = not configured (a fact, not a failure); boolean = probe outcome. */
export async function probeDb(url?: string): Promise<boolean | null> {
  if (!url) return null;
  return withTimeout(
    (async () => {
      const { Client } = await import("pg");
      const c = new Client({ connectionString: url, connectionTimeoutMillis: PROBE_TIMEOUT_MS });
      try {
        await c.connect();
        await c.query("SELECT 1");
        return true;
      } catch {
        return false;
      } finally {
        try {
          await c.end();
        } catch {
          /* ignore */
        }
      }
    })(),
    PROBE_TIMEOUT_MS + 200,
    false,
  );
}

export async function probeRedis(url?: string): Promise<boolean | null> {
  if (!url) return null;
  return withTimeout(
    (async () => {
      const { default: Redis } = await import("ioredis");
      const r = new Redis(url, { connectTimeout: PROBE_TIMEOUT_MS, maxRetriesPerRequest: 1, lazyConnect: true });
      try {
        await r.connect();
        await r.ping();
        return true;
      } catch {
        return false;
      } finally {
        r.disconnect();
      }
    })(),
    PROBE_TIMEOUT_MS + 200,
    false,
  );
}
