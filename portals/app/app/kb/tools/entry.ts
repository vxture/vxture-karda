// Tool-surface write backend (TD-009, track 9b): `karda.create_entry`, the
// structured-knowledge capture path. Where write_document captures a blob that
// the pipeline chunks, an Entry is a template-shaped record (KD-002) - a FAQ,
// glossary term, or SOP card - whose fields are the contract.
//
// create_entry is OBO-only (the gate is enforced in dispatch before this runs).
// It resolves the template code -> row identity, validates the fields against the
// template's contract, and writes the entry in `draft` (the entry state machine's
// initial state: editing must not enter the index, 100-kb-model 5.1). Submitting
// a draft into processing is a separate act on a path that is A1-blocked anyway -
// the same park-at-embed floor documents hit - so v1 stops at the durable draft.
import type { DispatchResult } from "./dispatch";
import type { CallerContext } from "./s2s";
import type { KbService } from "../lib/service";
import type { ContentService } from "../lib/content-service";
import type { TemplateResolver } from "../lib/template-resolver";
import { recordUsage } from "../../usage/lib/buffer";

export interface EntryDeps {
  kb: KbService;
  content: ContentService;
  templates: TemplateResolver;
}

const bad = (detail: string): DispatchResult => ({ status: 400, body: { error: "invalid_request", detail } });

/**
 * karda.create_entry: write a template-shaped entry into a library. `template_id`
 * is the stable template CODE (faq / glossary / sop); `fields` is the field map
 * validated against that template. The library must exist in the caller's
 * workspace - knowing an id is not permission.
 */
export async function createEntry(
  caller: CallerContext,
  args: Record<string, unknown>,
  deps: EntryDeps,
): Promise<DispatchResult> {
  const ws = caller.workspace;
  if (!ws) return { status: 400, body: { error: "no_workspace", detail: "token carries no workspace" } };

  const kbId = typeof args.kb_id === "string" ? args.kb_id : "";
  if (!kbId) return bad("kb_id is required");

  const templateId = typeof args.template_id === "string" ? args.template_id : "";
  if (!templateId) return bad("template_id is required");

  const fields = args.fields;
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return bad("fields must be an object");
  }

  // Resolve the template BEFORE the library lookup: an unknown template is a bad
  // request regardless of the library, and resolving is cheap (a preset lookup).
  const tpl = await deps.templates.resolveContent(templateId);
  if (!tpl) {
    return { status: 404, body: { error: "unknown_template", detail: `no content template '${templateId}'` } };
  }

  // Authorization: the library must exist and belong to the caller's workspace.
  const got = await deps.kb.get(kbId);
  if (!got.ok || got.value.workspaceId !== ws) {
    return { status: 404, body: { error: "not_found", detail: "library not found in this workspace" } };
  }

  const title = typeof args.title === "string" && args.title ? args.title : null;
  const res = await deps.content.createEntry(
    {
      kbId,
      contentTemplateId: tpl.id,
      templateVersion: tpl.version,
      fields: fields as Record<string, unknown>,
      title,
    },
    tpl.preset,
  );
  if (!res.ok) {
    const e = res.error;
    if (e.code === "missing_required_field") return bad(`missing required field: ${e.field}`);
    if (e.code === "unknown_field") return bad(`unknown field: ${e.field}`);
    return bad(e.code);
  }

  await emitIngest(ws, res.value.id);
  return { status: 201, body: { entry: { id: res.value.id, content_state: res.value.contentState } } };
}

/**
 * Per-doc ingest metering (catalog: create_entry -> per_doc, metric
 * karda.ingest). Attributed to the library's owning workspace (110-processing 5),
 * idempotent on the new row id so a re-emit cannot double-count. Best-effort: the
 * entry is already durable, so a buffer hiccup must not fail the write.
 */
async function emitIngest(workspaceId: string, rowId: string): Promise<void> {
  try {
    await recordUsage({ workspaceId, metric: "karda.ingest", amount: 1, idempotencyKey: `karda.ingest:${rowId}` });
  } catch {
    // swallow - metering is not on the write's critical path.
  }
}
