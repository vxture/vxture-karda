import { buildHealthIdentity } from "@vxture/shared";
import { BRAND } from "@karda/shared/brand";

// Liveness endpoint. 020: zero-dependency (no DB/Redis/upstream), the container
// healthcheck target, app bound to 0.0.0.0 (Dockerfile). 025: returns the full
// identity/provenance block via the platform's single-authority helper (no
// local re-implementation - see docs/60-operations TD-001 resolution).
// runtime="nodejs" so it reads the build-injected server env
// (APP_VERSION/GIT_SHA/DEPLOY_STAGE/BUILD_TIME); force-dynamic so `time` is
// per-request (proves real-time answer + clock).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  // `uptimeSec` 是 025 §3 契约里的可选字段,shared 1.5.0 的助手尚未产出——加在
  // 权威身份块**之上**,不改块本身;助手补上之后删这一行即可。仍零依赖。
  return Response.json({
    ...buildHealthIdentity({ service: `${BRAND.productCode}-app`, product: BRAND.productCode }),
    uptimeSec: Math.round(process.uptime()),
  });
}
