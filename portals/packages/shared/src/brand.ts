// Product brand constants. The product code was stamped at instantiation and is
// now the single in-code source of truth for karda's identity.
//
// Naming (owner, 2026-08-21): the product's Chinese name is 文渊知识服务平台
// ("Wenyuan" - after the imperial Wenyuan library), short form 文渊. It is a
// BRAND name only: productCode "karda" and every derived contract name (OIDC
// clients, DB, secrets, hosts) stay unchanged.
export const BRAND = {
  productCode: "karda",
  displayName: "文渊知识服务平台",
  shortName: "文渊",
  latinName: "Karda",
  defaultLocale: "zh-CN",
} as const;

export type Brand = typeof BRAND;
