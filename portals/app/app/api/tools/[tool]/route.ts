import { NextResponse } from "next/server";
import { authenticateS2S } from "../../../kb/tools/gateway";
import { dispatchTool, type ToolBackends } from "../../../kb/tools/dispatch";
import { KbService } from "../../../kb/lib/service";
import { getKbStore } from "../../../kb/lib/store";
import { ContentService } from "../../../kb/lib/content-service";
import { getContentStore } from "../../../kb/lib/content-store";
import { getObjectStore } from "../../../kb/storage/objectstore";
import { getProcessingRuntime } from "../../../kb/processing/runtime";
import { writeDocument } from "../../../kb/tools/write";

// POST /api/tools/:tool   (S2S, tailnet only)
//
// The karda.* tool invocation endpoint. Authenticate the S2S token, then
// dispatch - the mode gate (OBO-only refusal) runs inside dispatch, before any
// backend, so a service-mode call to a write tool is refused here even though
// that write path is not built yet.
export const dynamic = "force-dynamic";

function backends(): ToolBackends {
  const kb = new KbService(getKbStore());
  const content = new ContentService(getContentStore());
  const objects = getObjectStore();
  const runtime = getProcessingRuntime();
  return {
    async listKbs(workspaceId) {
      return kb.list(workspaceId);
    },
    // write_document is wired (TD-009 9a): capture a document and enqueue it on
    // the shared runtime queue (the same one POST /api/kb/processing/tick drains).
    writeDocument: (caller, args) => writeDocument(caller, args, { kb, content, objects, queue: runtime.queue }),
    // search/ask are intentionally not injected yet: the retrieval chain needs a
    // recall backend (BM25) and a C2 visible-set fill to run for real (TD-008).
    // Dispatch returns not_implemented for them, which is honest; wiring them is
    // a one-line addition here once those backends land.
  };
}

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

  const result = await dispatchTool(`karda.${tool}`, args, auth.caller, backends());
  return NextResponse.json(result.body, { status: result.status });
}
