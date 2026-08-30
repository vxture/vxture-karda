import { BRAND } from "@karda/shared/brand";
import { pageTitle } from "../_i18n/server-locale";
import { shell } from "../_i18n/messages/shell";
import { safeReturnTo } from "../auth/lib/return-to";
import { ProductGate } from "../access/product-gate";

// /gate - the product front door (ported from vxtpl 2026-08-30; karda was
// instantiated before the template grew this layer, so this is inherited-layer
// catch-up, not product invention).
//
// It is a route rather than something bolted onto `/` so that the entry check
// has an address: `/auth/login?returnTo=/gate` comes back here, the gate
// re-runs, and the visitor lands inside with entitlement already resolved.
// Middleware sends an unverified visitor here from anywhere in the product.
export async function generateMetadata() {
  return pageTitle(shell.gateTitle);
}

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.from;
  // Where the visitor was actually going before the middleware intercepted
  // them. Validated with the same whitelist the login round trip uses, so a
  // crafted `?from=` cannot turn the gate into an open redirect.
  const destination = safeReturnTo(typeof raw === "string" ? raw : null);

  return (
    <ProductGate
      productName={BRAND.displayName}
      destination={destination}
      tagline="验证通过后将自动进入产品"
    />
  );
}
