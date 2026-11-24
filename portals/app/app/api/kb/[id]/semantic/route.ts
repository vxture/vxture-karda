import { Pool } from "pg";
import { NextResponse } from "next/server";
import { requireAuth } from "../../../../kb/api/http";
import { getOidcConfig } from "../../../../auth/lib/config";
import { userAdmission } from "../../../../platform/admission";
import { getObjectStore } from "../../../../kb/storage/objectstore";
import { PostgresSemanticStore } from "../../../../kb/semantic/store-postgres";
import { parseReviewRequest, reviewOriginAllowed } from "../../../../kb/semantic/review-request";

export const dynamic = "force-dynamic";

function jsonError(error: unknown): Response {
  const code = error instanceof Error ? error.message : "semantic_request_failed";
  const known = /^(semantic_|publication_)/.test(code);
  const status = !known ? 503 : /denied/.test(code) ? 403 : /unavailable/.test(code) ? 404
    : /corrupt/.test(code) ? 503 : /stale|conflict|changed|required/.test(code) ? 409 : 400;
  return NextResponse.json({ error: known ? code : "semantic_unavailable" }, { status, headers: { "Cache-Control": "no-store" } });
}

async function withStore<T>(fn: (store: PostgresSemanticStore, identity: { workspaceId: string; sub: string; roles: string[]; productCode: string }) => Promise<T>) {
  const auth = await requireAuth("service.publish");
  if (!auth.ok) return auth;
  if (!process.env.DATABASE_URL || !auth.user.activeWorkspace) return { ok: false as const, response: NextResponse.json({ error: "semantic_unavailable" }, { status: 503 }) };
  const identity = { workspaceId: auth.user.activeWorkspace, sub: auth.user.sub, roles: [...auth.user.roles], productCode: "karda" };
  const objects = getObjectStore();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 5000,
    statement_timeout: 15000, allowExitOnIdle: true });
  const store = new PostgresSemanticStore(pool, objects, async () => (await userAdmission(auth.user)).allowed);
  try { return { ok: true as const, value: await fn(store, identity) }; }
  finally { await pool.end(); }
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
  const { id } = await ctx.params;
  const url = new URL(req.url), runId = url.searchParams.get("runId");
  if (url.searchParams.has("view")) {
    if (url.searchParams.get("view") !== "maintenance" || [...url.searchParams.keys()].some(key=>key!=="view"))
      throw new Error("semantic_invalid_query");
    const report = await withStore((store,identity)=>store.maintenance(identity,id));
    if(!report.ok)return report.response;
    return NextResponse.json(report.value,{headers:{"Cache-Control":"private, no-store"}});
  }
  const result = await withStore(async (store, identity) => runId
    ? store.inspectCompile(identity, id, runId)
    : store.listCompiles(identity, id, Number(url.searchParams.get("limit") ?? "20"), url.searchParams.get("before") ?? undefined));
  if (!result.ok) return result.response;
  return NextResponse.json(result.value, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  if (!reviewOriginAllowed(req, getOidcConfig().appOrigin) || !req.headers.get("content-type")?.startsWith("application/json"))
    return NextResponse.json({ error: "origin_invalid" }, { status: 403 });
  const { id } = await ctx.params;
  try {
    const body = parseReviewRequest(await req.text());
    const result = await withStore(async (store, identity) => {
      switch (body.action) {
        case "review":
          return store.reviewRelation(identity, id, {
            runId: body.runId, relationId: body.relationId, expectedRevision: body.expectedRevision,
            decision: body.decision, note: body.note,
          });
        case "preview":
          return store.preview(identity, id, body.runId, body.eventId);
        case "publish":
          return store.submitPreview(identity, id, {
            runId: body.runId, eventId: body.eventId, expectedGeneration: body.expectedGeneration,
            fingerprint: body.fingerprint,
          });
        default: throw new Error("semantic_action_required");
      }
    });
    if (!result.ok) return result.response;
    return NextResponse.json(result.value, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}
