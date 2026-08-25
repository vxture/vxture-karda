import { NextResponse } from "next/server";
import { KbService } from "../../../../../../kb/lib/service";
import { getKbStore } from "../../../../../../kb/lib/store";
import { ContentService } from "../../../../../../kb/lib/content-service";
import { getContentStore } from "../../../../../../kb/lib/content-store";
import { getProcessingRuntime, enqueueForDocument } from "../../../../../../kb/processing/runtime";
import { requireAuth } from "../../../../../../kb/api/http";
import { errorJson } from "../../../../../../kb/api/http";

// POST /api/kb/:id/documents/:docId/reprocess   re-run a failed document
//
// WHY THIS EXISTS RATHER THAN A BUTTON ON /api/kb/processing/tick: that endpoint
// is gated by INTERNAL_JOB_TOKEN - a machine credential for a scheduler on the
// tailnet - and it drains the WHOLE queue. Neither fits a person clicking
// "retry" on one document they just fixed. So retry gets its own route: user
// session, scoped to one document, and no ability to touch anything else.
//
// The transition is the state machine's, not ours: `failed -> processing` is
// already legal (state.ts: "retry, or give up"), so a document in any other
// state is refused BY THE MACHINE with illegal_transition rather than by a
// condition written here that could drift from it.
//
// The re-run carries a NEW generation. The task key is derived from
// (docId, contentHash, configFingerprint, generation), so without a fresh
// generation an identical retry would dedup against the task that already
// failed and silently do nothing - which is exactly what a person clicking
// retry would read as "the button is broken".
export const dynamic = "force-dynamic";

function content(): ContentService {
  return new ContentService(getContentStore());
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string; docId: string }> }): Promise<Response> {
  const auth = await requireAuth();
  if (!auth.ok) return auth.response;
  const { id, docId } = await ctx.params;

  const kb = await new KbService(getKbStore()).get(id);
  if (!kb.ok || kb.value.workspaceId !== auth.user.activeWorkspace) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const c = content();
  const found = await c.getDocument(docId);
  if (!found.ok || found.value.kbId !== id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const doc = found.value;

  const moved = await c.transitionDocument(docId, "processing");
  if (!moved.ok) return errorJson(moved.error);

  // A monotonically increasing generation. Wall-clock seconds is enough: the
  // only requirement is that two retries of the same document never collide on
  // the task key, and a person cannot click twice within the same second often
  // enough to matter - and if they do, the dedup is the correct outcome.
  const generation = Math.floor(Date.now() / 1000);
  const accepted = enqueueForDocument(getProcessingRuntime().queue, {
    docId,
    kbId: kb.value.id,
    workspaceId: kb.value.workspaceId,
    contentHash: doc.contentHash,
    config: {
      processingTemplateId: kb.value.processingTemplateId,
      processingParams: {},
      embeddingModel: null,
    },
    trigger: "rebuild",
    retryGeneration: generation,
    createdInProduct: "karda",
    createdBy: auth.user.sub,
  });

  return NextResponse.json({ document: moved.value, queued: accepted });
}
