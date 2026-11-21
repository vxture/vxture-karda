import { test } from "node:test";
import assert from "node:assert/strict";
import { subscribeUrl } from "./deeplink";

test("all conversion intents use the product pricing page without checkout instructions", () => {
  for (const intent of ["upgrade", "renew", "addon"] as const) {
    assert.equal(subscribeUrl({ intent, targetTier: "pro", metric: "seat.max" }),
      "https://vxture.com/zh-CN/pricing?product=karda");
  }
});
