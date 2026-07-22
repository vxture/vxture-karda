// Product brand constants. The product code was stamped at instantiation and is
// now the single in-code source of truth for karda's identity.
export const BRAND = {
  productCode: "karda",
  displayName: "Karda",
  defaultLocale: "en",
} as const;

export type Brand = typeof BRAND;
