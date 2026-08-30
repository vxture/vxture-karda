import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getOidcConfig } from "../../auth/lib/config";
import { getAuthUser } from "../../auth/lib/session";
import { devLoginEnabled, decodeDevSession, DEV_LOGIN_COOKIE } from "../../auth/lib/dev-login";
import type { AuthUser } from "../../auth/lib/claims";
import { getEntitlementResolver } from "../../entitlement/resolver";
import { ctaFor, hasDataAccess, hasProductAccess } from "../../entitlement/types";
import { isDeployedStage } from "../../lib/deploy-stage";
import type { AccessState } from "../../access/types";

// GET /api/access - the one call a product front door makes.
//
// It exists because the two facts a gate needs live in different places by
// design: identity comes from the RP session and entitlement is never in the
// token (D12 - always fetched via C2). A client fetching /auth/session and
// /api/entitlement in parallel would be reading the same session twice, and
// those two reads race: both call getAuthUser, which silently refreshes an
// access token inside 60s of expiry using a ROTATING refresh token. One
// rotation wins, the other gets invalid_grant - so a perfectly signed-in user
// can see "authenticated" from one call and 401 from the other.
//
// Resolving once server-side removes the race, halves the Redis and JWKS work,
// and lets the gate render a single decision instead of reconciling two.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const cfg = getOidcConfig();

  const jar = await cookies();

  // karda 对模板的一处扩展:本地有 dev-login(三重门,见 auth/lib/dev-login)时,
  // 前门**照常裁决**——dev 会话在就 authenticated,不在就 anonymous(登录按钮经
  // /auth/login 移交到 dev-login)。模板在无 OIDC 时一律放行,那是因为 vxtpl 本地
  // 没有任何登录机制;karda 有,放行反而制造死循环:门放人进去,页面的 API 又
  // 401,把人再送回门。
  let user: AuthUser | null = null;
  if (devLoginEnabled(cfg.enabled)) {
    user = decodeDevSession(jar.get(DEV_LOGIN_COOKIE)?.value);
  } else if (!cfg.enabled) {
    // 真没有任何登录机制:部署态是待修的死角(unconfigured),本地/CI 的纯离线
    // 演示态放行——否则前门是一堵谁都过不去的墙。
    const state: AccessState = isDeployedStage()
      ? { status: "unconfigured" }
      : { status: "open", reason: "dev-no-oidc" };
    return NextResponse.json(state);
  } else {
    const rpsid = jar.get(cfg.cookieName)?.value;
    user = rpsid ? await getAuthUser(cfg, rpsid).catch(() => null) : null;
  }

  if (!user) return NextResponse.json({ status: "anonymous" } satisfies AccessState);

  // A suspended or closed account is not a session (080-rp 2.6). Kept distinct
  // from anonymous: sending this user to sign in again would loop them.
  if (user.accountStatus && user.accountStatus !== "active") {
    return NextResponse.json({ status: "inactive-account" } satisfies AccessState);
  }

  // Signed in, but the session carries no workspace to scope entitlement to.
  // Nothing to resolve, and re-authenticating will not add one.
  if (!user.activeWorkspace) {
    return NextResponse.json({ status: "no-workspace", user } satisfies AccessState);
  }

  const entitlement = await getEntitlementResolver().resolve(user.activeWorkspace);
  return NextResponse.json({
    status: "authenticated",
    user,
    entitlement,
    gates: {
      productAccess: hasProductAccess(entitlement),
      dataAccess: hasDataAccess(entitlement),
      cta: ctaFor(entitlement),
    },
  } satisfies AccessState);
}
