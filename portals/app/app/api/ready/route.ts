import { NextResponse } from "next/server";
import { serviceIdentity } from "@vxture/shared";
import { BRAND } from "@karda/shared/brand";
import { probeDb, probeRedis } from "../../lib/probes";
import { readiness } from "../../lib/readiness";

// GET /api/ready - readiness (025 §2: identity block + per-dependency checks).
//
// 与 /api/health 的分工是标准的铁律:liveness 零依赖,容器探针只探它;readiness
// 供滚动发布闸门与编排用,fail -> 503。判定口径在 lib/readiness.ts(纯函数,
// 含每个依赖挂哪一档的理由);探针与 /api/status 共用一份(lib/probes.ts),两个
// 面不可能漂出两套超时语义。
//
// 不鉴权:身份块是可公开信息(025 §3),checks 只有 ok/fail/off 三个词——比一次
// 失败的页面加载泄露的还少。/api/status 上锁是因为它报配置在位细节,不同一档。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const [db, redis] = await Promise.all([
    probeDb(process.env.DATABASE_URL),
    probeRedis(process.env.REDIS_URL),
  ]);
  const r = readiness(db, redis);
  const identity = serviceIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode });
  return NextResponse.json(
    { status: r.status, ...identity, uptimeSec: Math.round(process.uptime()), checks: r.checks },
    { status: r.status === "fail" ? 503 : 200 },
  );
}
