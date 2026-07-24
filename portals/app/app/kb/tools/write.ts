// Tool-surface write backends (TD-009, track 9a): the agent-facing knowledge-
// capture path. `karda.write_document` is OBO-only (the gate is enforced in
// dispatch before this runs), so a service call never reaches here - only a call
// carrying a real user does.
//
// This reuses the exact HTTP upload path (uploadDocument -> object storage +
// document record + enqueue on the shared runtime queue), so a document written
// through a tool and one uploaded through the Console are indistinguishable
// downstream: both land in `processing` and a tick drains them. With Atlas A1
// unavailable the document parks at embed by design - nothing is lost.
import type { DispatchResult } from "./dispatch";
import type { CallerContext } from "./s2s";
import type { KbService } from "../lib/service";
import type { ContentService } from "../lib/content-service";
import type { ObjectStore } from "../storage/objectstore";
import type { TaskQueue } from "../processing/queue";
import type { DocumentRow } from "../lib/content-store";
import { uploadDocument } from "../lib/upload";
import { enqueueForDocument } from "../processing/runtime";

export interface WriteDeps {
  kb: KbService;
  content: ContentService;
  objects: ObjectStore;
  /** the shared runtime queue - the same one the tick endpoint drains. */
  queue: TaskQueue;
}

const bad = (detail: string): DispatchResult => ({ status: 400, body: { error: "invalid_request", detail } });

/**
 * karda.write_document: capture a document into a library. Accepts inline
 * `content` (utf-8 text) today; `file_ref` ingestion (a pre-staged object or an
 * external reference) is a later addition. The library must exist in the caller's
 * workspace - knowing an id is not permission, the same floor the HTTP upload
 * route enforces.
 */
export async function writeDocument(
  caller: CallerContext,
  args: Record<string, unknown>,
  deps: WriteDeps,
): Promise<DispatchResult> {
  // dispatch guarantees a workspace (400 no_workspace) and an OBO user before
  // this runs; assert the workspace for the type and as defence in depth.
  const ws = caller.workspace;
  if (!ws) return { status: 400, body: { error: "no_workspace", detail: "token carries no workspace" } };

  const kbId = typeof args.kb_id === "string" ? args.kb_id : "";
  if (!kbId) return bad("kb_id is required");

  const content = typeof args.content === "string" ? args.content : null;
  if (content === null) {
    return {
      status: 501,
      body: {
        error: "not_implemented",
        detail: "write_document accepts inline `content` (utf-8) today; `file_ref` ingestion is not wired yet",
      },
    };
  }
  if (content.length === 0) return bad("content is empty");

  // Authorization: the library must exist and belong to the caller's workspace.
  const got = await deps.kb.get(kbId);
  if (!got.ok || got.value.workspaceId !== ws) {
    return { status: 404, body: { error: "not_found", detail: "library not found in this workspace" } };
  }
  const kb = got.value;

  const title = typeof args.title === "string" && args.title ? args.title : "captured document";
  const bytes = Buffer.from(content, "utf-8");

  const result = await uploadDocument(
    { kbId, workspaceId: ws, folderId: null, title, mime: "text/plain", bytes },
    deps.content,
    deps.objects,
    (doc: DocumentRow) => {
      // Tool ingest is an interactive act (tierForTrigger("api") = interactive).
      enqueueForDocument(deps.queue, {
        docId: doc.id,
        kbId: kb.id,
        workspaceId: ws,
        contentHash: doc.contentHash,
        config: { processingTemplateId: kb.processingTemplateId, processingParams: {}, embeddingModel: null },
        trigger: "api",
      });
    },
  );

  if (!result.ok) {
    if (result.error.code === "duplicate_document") {
      return { status: 409, body: { error: "duplicate_document", detail: "identical content already in this library" } };
    }
    return bad(result.error.code);
  }

  // NOTE: per-doc metering (metric karda.ingest) is declared in the catalog but
  // not emitted here yet - wiring it to the usage buffer is a small follow-up
  // (TD-009), and attribution is to the library's owning workspace, not the
  // caller, per 110-processing 5.
  return { status: 201, body: { document: { id: result.value.id, content_state: result.value.contentState } } };
}
