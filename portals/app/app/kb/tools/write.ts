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
import { recordUsage } from "../../usage/lib/buffer";

export interface WriteDeps {
  kb: KbService;
  content: ContentService;
  objects: ObjectStore;
  /** the shared runtime queue - the same one the tick endpoint drains. */
  queue: TaskQueue;
  authorize?:(caller:CallerContext,kbId:string)=>Promise<void>;
  resolveFile?:(caller:CallerContext,kbId:string,ref:unknown)=>Promise<{bytes:Buffer;title:string;mime:string;documentId:string}>;
}

const bad = (detail: string): DispatchResult => ({ status: 400, body: { error: "invalid_request", detail } });

/**
 * karda.write_document: capture a document into a library. Accepts inline
 * `content` (utf-8 text) today; `file_ref` ingestion (a current authorized same-library document, not an
 * external URL or object key) uses the shared runtime resolver. The library must exist in the caller's
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

  if(caller.mode==='obo'&&!caller.user||args.file_ref!==undefined&&caller.mode!=='obo')return{status:403,body:{error:'access_denied'}};
  const content=typeof args.content==='string'?args.content:null;
  if((content===null)===(args.file_ref===undefined))return bad('supply exactly one of content or file_ref');
  if(content!==null&&(content.length===0||Buffer.byteLength(content)>1024*1024))return bad('content must contain 1 to 1048576 UTF-8 bytes');
  // Authorization: the library must exist and belong to the caller's workspace.
  const got = await deps.kb.get(kbId);
  if (!got.ok || got.value.workspaceId !== ws) {
    return { status: 404, body: { error: "not_found", detail: "library not found in this workspace" } };
  }
  const kb = got.value;
  if(caller.mode==='obo'&&(kb.ownerType!=='user'||kb.ownerSub!==caller.user))return{status:403,body:{error:'access_denied'}};
  let resolved:{bytes:Buffer;title:string;mime:string;documentId:string}|undefined;
  try{if(caller.mode==='obo')await deps.authorize?.(caller,kbId);if(content===null){if(!deps.resolveFile)return bad('file_ref resolver is unavailable');resolved=await deps.resolveFile(caller,kbId,args.file_ref);}}catch{return{status:403,body:{error:'file_reference_denied'}};}


  const title = typeof args.title === "string" && args.title ? args.title : resolved?.title??"captured document";
  const bytes = resolved?.bytes??Buffer.from(content!, "utf-8");

  const result = await uploadDocument(
    {
      kbId,
      workspaceId: ws,
      folderId: null,
      title,
      mime: resolved?.mime??"text/plain",
      bytes,
      // Provenance: the calling product (S2S act.sub, or "runos" on the Runos
      // channel) + the OBO user when one exists (null on a service-mode write).
      createdInProduct: caller.callerProduct,
      createdBy: caller.user,
    },
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
    if (result.error.code === "capacity_exceeded") return { status: 403, body: { error: result.error.code } };
    if (result.error.code === "capacity_unconfigured" || result.error.code === "capacity_unavailable") {
      return { status: 503, body: { error: result.error.code } };
    }
    if (result.error.code === "duplicate_document") {
      return { status: 409, body: { error: "duplicate_document", detail: "identical content already in this library" } };
    }
    return bad(result.error.code);
  }

  // Per-doc ingest metering (catalog: write_document -> per_doc, metric
  // karda.ingest). Attributed to the library's owning workspace (110-processing
  // 5), idempotent on the new document id. Best-effort: the document is already
  // durable and enqueued, so a buffer hiccup must not fail the write. A 409
  // duplicate never reaches here, so a re-captured identical blob is not counted.
  try {
    await recordUsage({
      workspaceId: ws,
      metric: "karda.ingest",
      amount: 1,
      idempotencyKey: `karda.ingest:${result.value.id}`,
    });
  } catch {
    // swallow - metering is not on the write's critical path.
  }

  return { status: 201, body: { document: { id: result.value.id, content_state: result.value.contentState } } };
}
