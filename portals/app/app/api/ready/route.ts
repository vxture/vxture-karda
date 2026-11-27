import {jenaCommand} from "../../kb/graph/client";
import { NextResponse } from "next/server";
import { serviceIdentity } from "@vxture/shared";
import { BRAND } from "@karda/shared/brand";
import { probeDb, probeRedis } from "../../lib/probes";
import { readiness } from "../../lib/readiness";
import { isDeployedStage } from "../../lib/deploy-stage";
import { probeStorageConfiguration } from "../../kb/storage/config";

// GET /api/ready - readiness (025 §2: identity block + per-dependency checks).
//
// 与 /api/health 的分工是标准的铁律:liveness 零依赖,容器探针只探它;readiness
// 供滚动发布闸门与编排用,fail -> 503。判定口径在 lib/readiness.ts(纯函数,
// 含每个依赖挂哪一档的理由);探针与 /api/status 共用一份(lib/probes.ts),两个
// 面不可能漂出两套超时语义。
//
// 不鉴权:身份块是可公开信息(025 §3),checks 只有 ok/fail/off 三个词——比一次
// 失败的页面加载泄露的还少。/api/status 只公开缓存的状态摘要。
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const [db, redis, storageConfig] = await Promise.all([
    probeDb(process.env.DATABASE_URL),
    probeRedis(process.env.REDIS_URL),
    probeStorageConfiguration(process.env),
  ]);
  const jena=process.env.KARDA_JENA_URL?await jenaCommand({operation:"health"}).then(()=>"ok" as const,()=>"fail" as const):undefined;
  const deployed = isDeployedStage();
  const r = readiness(db, redis, deployed, storageConfig);
  const identity = serviceIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode });
  return NextResponse.json(
    { status: jena==="fail"?"fail":r.status, ...identity, uptimeSec: Math.round(process.uptime()), checks: {...r.checks,...(jena?{jena}:{})} },
    { status: r.status === "fail" || jena === "fail" ? 503 : 200 },
  );
}
