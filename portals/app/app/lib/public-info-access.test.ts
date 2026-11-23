import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

test("only the exact public information paths bypass the product sign-in gate", () => {
  const previous = process.env.OIDC_RP_ENABLED;
  process.env.OIDC_RP_ENABLED = "on";
  try {
    const request = (path: string) => middleware(new NextRequest("https://karda.ruyin.work" + path));
    for (const path of ["/status", "/entitlement-matrix"]) {
      assert.equal(request(path).headers.get("x-middleware-next"), "1");
    }
    for (const path of ["/", "/status/private", "/entitlement-matrix/private", "/members"]) {
      const response = request(path);
      assert.equal(response.status, 307);
      const location = new URL(response.headers.get("location")!);
      assert.equal(location.pathname, "/gate");
      if (path !== "/") assert.equal(location.searchParams.get("from"), path);
    }
  } finally {
    if (previous === undefined) delete process.env.OIDC_RP_ENABLED;
    else process.env.OIDC_RP_ENABLED = previous;
  }
});
