import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { buildStatus, statusMode } from "../../lib/status";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import { probeDb, probeRedis } from "../../lib/probes";

// GET /api/status - the integration-status surface. Gated by STATUS_PAGE:
// off -> 404, authed -> requires a valid session, public -> open. Reports only
// non-secret config (presence booleans + identifiers) plus a short-timeout
// DB/Redis reachability probe. Never returns a secret value (see status.test.ts).
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const mode = statusMode(process.env);
  if (mode === "off") return new NextResponse("not found", { status: 404 });

  if (mode === "authed") {
    const cfg = getOidcConfig();
    const jar = await cookies();
    const rpsid = jar.get(cfg.cookieName)?.value;
    const user = rpsid ? await getAuthUser(cfg, rpsid).catch(() => null) : null;
    if (!user) return new NextResponse("unauthorized", { status: 401 });
  }

  const status = buildStatus(process.env, new Date().toISOString());
  const [dbReachable, redisReachable] = await Promise.all([
    probeDb(process.env.DATABASE_URL),
    probeRedis(process.env.REDIS_URL),
  ]);
  status.data.database.reachable = dbReachable;
  status.data.redis.reachable = redisReachable;

  return NextResponse.json(status);
}
