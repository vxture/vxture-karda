import { NextResponse } from "next/server";
import { prismaEnabled } from "../../../lib/db";
import { listSets, createSet } from "../../../kb/evaluation/store";
import { requireAuth, readJson } from "../../../kb/api/http";

// GET  /api/evaluation/sets   the workspace's authored question sets
// POST /api/evaluation/sets   author a new one
//
// KD-011 ruled out synthetic QA generation for v1, so every set here is written
// by a person. That is a cost, and it is the point: a set generated from the
// corpus measures whether retrieval can find what it just indexed, which is a
// tautology, not a quality baseline.
//
// Offline this reports UNAVAILABLE rather than serving a demo set. An evaluation
// whose results do not persist cannot answer "did this change help" - a demo run
// with a working button would be the most misleading surface in the product.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!prismaEnabled()) return NextResponse.json({ sets: [], live: false });
  return NextResponse.json({ sets: await listSets(auth.user.activeWorkspace), live: true });
}

export async function POST(req: Request): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  if (!prismaEnabled()) {
    return NextResponse.json({ error: "no_database" }, { status: 503 });
  }

  const body = await readJson(req);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name_required" }, { status: 400 });
  const kbScope = Array.isArray(body.kb_scope)
    ? body.kb_scope.filter((x: unknown): x is string => typeof x === "string")
    : [];

  try {
    const set = await createSet({
      workspaceId: auth.user.activeWorkspace,
      name,
      description: typeof body.description === "string" ? body.description : null,
      kbScope,
      createdBy: auth.user.sub,
    });
    return NextResponse.json({ set }, { status: 201 });
  } catch {
    // uidx_eval_set_ws_name. A duplicate name is a conflict, not a bad request:
    // the caller sent something valid that collides with what is already there.
    return NextResponse.json({ error: "name_taken" }, { status: 409 });
  }
}
