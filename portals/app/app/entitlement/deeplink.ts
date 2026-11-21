import { BRAND } from "@karda/shared/brand";
import type { Tier } from "./types";

export type Intent = "upgrade" | "renew" | "addon";

// The website resolves purchase authorization and workspace selection.
// Historical caller options do not become checkout instructions.
export function subscribeUrl(_opts: { intent: Intent; targetTier?: Tier; metric?: string }): string {
  return `https://vxture.com/zh-CN/pricing?product=${BRAND.productCode}`;
}
