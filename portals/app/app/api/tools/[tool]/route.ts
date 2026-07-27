import { NextResponse } from "next/server";
import { authenticateS2S } from "../../../kb/tools/gateway";
import { dispatchTool, type ToolBackends } from "../../../kb/tools/dispatch";
import { KbService } from "../../../kb/lib/service";
import { getKbStore } from "../../../kb/lib/store";
import { ContentService } from "../../../kb/lib/content-service";
import { getContentStore } from "../../../kb/lib/content-store";
import { getObjectStore } from "../../../kb/storage/objectstore";
import { getProcessingRuntime } from "../../../kb/processing/runtime";
import { getTemplateResolver } from "../../../kb/lib/template-resolver";
import { getAttachmentStore } from "../../../kb/attachments/store";
import { getRecallCorpus, getRecallTextResolver } from "../../../kb/retrieval/corpus";
import { getVisibleSetResolver } from "../../../kb/retrieval/visible-set";
import { getGenerationClient, askModelSelection } from "../../../kb/retrieval/generation";
import { searchTool } from "../../../kb/retrieval/search-tool";
import { askTool } from "../../../kb/retrieval/ask-tool";
import { writeDocument } from "../../../kb/tools/write";
import { createEntry } from "../../../kb/tools/entry";
import { createKb, attachKb, detachKb } from "../../../kb/attachments/tools";

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
  const generation = getGenerationClient();
  return {
    async listKbs(workspaceId) {
      return kb.list(workspaceId);
    },
    // write_document is wired (TD-009 9a): capture a document and enqueue it on
    // the shared runtime queue (the same one POST /api/kb/processing/tick drains).
    writeDocument: (caller, args) => writeDocument(caller, args, { kb, content, objects, queue: runtime.queue }),
    // create_entry is wired (TD-009 9b): write a template-shaped draft entry. The
    // resolver bridges the template code the caller passes -> the seeded row id.
    createEntry: (caller, args) => createEntry(caller, args, { kb, content, templates: getTemplateResolver() }),
    // create_kb / attach_kb / detach_kb are wired (TD-009 9b): the attachment
    // store keys (workspace, user, calling-product) -> kb. create_kb also makes
    // the library; attach/detach only touch the list.
    createKb: (caller, args) => createKb(caller, args, { kb, attachments: getAttachmentStore() }),
    attachKb: (caller, args) => attachKb(caller, args, { kb, attachments: getAttachmentStore() }),
    detachKb: (caller, args) => detachKb(caller, args, { kb, attachments: getAttachmentStore() }),
    // search is wired (TD-008): scope (visible-set INTERSECT attachment) + BM25
    // recall + rerank-degrade. Returns real results over attached+indexed content
    // (empty until content indexes, which is correct, not a leak). ask stays
    // not_implemented until the Atlas A4 generation client + a chunk resolver land.
    search: (caller, args) =>
      searchTool(caller, args, {
        visibleSet: getVisibleSetResolver(getKbStore()),
        attachments: getAttachmentStore(),
        corpus: getRecallCorpus(),
      }),
    // ask is wired only when the Atlas A4 client is configured (ATLAS_BASE_URL +
    // OIDC creds to mint the aud=atlas bearer, getGenerationClient); otherwise it
    // is left out and dispatch returns not_implemented rather than failing at call
    // time. Model selection (KD-109): auto-adapt via ATLAS_ASK_TASK_PROFILE, else a
    // pinned ATLAS_ASK_MODEL - askModelSelection emits exactly one.
    ...(generation
      ? {
          ask: (caller, args) =>
            askTool(caller, args, {
              visibleSet: getVisibleSetResolver(getKbStore()),
              attachments: getAttachmentStore(),
              corpus: getRecallCorpus(),
              textResolver: getRecallTextResolver(),
              generation,
              ...askModelSelection(),
            }),
        }
      : {}),
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
