import { NextResponse } from "next/server";
import { CONNECTORS, degradations, meetsDeleteInvariant } from "../../kb/connectors/catalog";
import { requireAuth } from "../../kb/api/http";

// GET /api/connectors   the connector catalogue a library can bind to
//
// The registry is code, not data (catalog.ts): adding a connector is "implement
// the capability interface + register a code", with no DDL change. So this route
// is a projection of that constant, and it exists because the bind form cannot
// offer a choice it has no way to enumerate.
//
// It publishes the DEGRADATIONS with each connector, not just the names. A
// connector declares what it can do across five axes and the framework adapts;
// section 4 requires the trade-offs be explicitly accepted rather than silently
// absorbed, and that can only happen if the owner sees them BEFORE binding
// rather than in a doc they will not read.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    connectors: CONNECTORS.map((c) => ({
      code: c.code,
      name: c.name,
      capabilities: c.capabilities,
      degradations: degradations(c.capabilities),
      // I4 (delete-expressible). A connector that can neither be told of deletes
      // nor reconcile to find them is a COMPLIANCE gap, not a UX one - the
      // framework still allows binding it (KD-013), which is exactly why the
      // caller has to be able to say so.
      meetsDeleteInvariant: meetsDeleteInvariant(c.capabilities),
    })),
  });
}
