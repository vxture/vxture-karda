import { NextResponse } from "next/server";
import { authenticateS2S } from "../../../kb/tools/gateway";
import { dispatchTool } from "../../../kb/tools/dispatch";
import { buildToolBackends } from "../../../kb/tools/backends";

// POST /api/tools/:tool   (S2S, tailnet only)
//
// The karda.* tool invocation endpoint. Authenticate the S2S token, then
// dispatch - the mode gate (OBO-only refusal) runs inside dispatch, before any
// backend. Backend assembly lives in kb/tools/backends.ts, shared with the
// Runos MCP channel (/api/mcp) so the two channels cannot drift apart.
export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ tool: string }> }): Promise<Response> {
  const auth = await authenticateS2S(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { tool } = await ctx.params;
  let args: Record<string, unknown> = {};
  try {
    const body = await req.json();
    if (body && typeof body === "object") args = body as Record<string, unknown>;
  } catch {
    // empty/invalid body -> no args
  }

  const result = await dispatchTool(`karda.${tool}`, args, auth.caller, buildToolBackends());
  return NextResponse.json(result.body, { status: result.status });
}
