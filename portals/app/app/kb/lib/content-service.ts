// Content service: folders, documents, entries within a KB. This is where the
// state machine (state.ts) and the template field rules are enforced - the store
// writes rows, the service decides whether a transition or a field set is legal.
import {
  assertContentTransition,
  canTransitionContent,
  initialContentState,
  type ContentState,
} from "./state";
import type {
  ContentStore,
  CreateDocumentInput,
  CreateEntryInput,
  DocumentRow,
  DocumentSource,
  EntryRow,
  FolderRow,
} from "./content-store";
import { FIELD_NAME_RE } from "./metadata";
import type { ContentPreset } from "./presets";

export type ContentError =
  | { code: "not_found" }
  | { code: "folder_name_taken" }
  | { code: "connector_code_required" }
  | { code: "connector_code_not_allowed" }
  | { code: "duplicate_document" }
  | { code: "illegal_transition"; from: ContentState; to: ContentState }
  | { code: "missing_required_field"; field: string }
  | { code: "unknown_field"; field: string };

export type Result<T> = { ok: true; value: T } | { ok: false; error: ContentError };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = (error: ContentError): Result<never> => ({ ok: false, error });

export class ContentService {
  constructor(private store: ContentStore) {}

  // --- folders ---------------------------------------------------------------

  async createFolder(kbId: string, name: string): Promise<Result<FolderRow>> {
    if (await this.store.folderNameTaken(kbId, name)) return err({ code: "folder_name_taken" });
    return ok(await this.store.createFolder(kbId, name));
  }

  async listFolders(kbId: string): Promise<FolderRow[]> {
    return this.store.listFolders(kbId);
  }

  async deleteFolder(id: string): Promise<Result<true>> {
    return (await this.store.deleteFolder(id)) ? ok(true) : err({ code: "not_found" });
  }

  // --- documents -------------------------------------------------------------

  async createDocument(input: CreateDocumentInput): Promise<Result<DocumentRow>> {
    // connector_code must be present iff source is 'connector' - mirrors
    // chk_document_connector_code so the app rejects the shape clearly before the
    // DB rejects it opaquely.
    const isConnector = input.source === "connector";
    if (isConnector && !input.connectorCode) return err({ code: "connector_code_required" });
    if (!isConnector && input.connectorCode) return err({ code: "connector_code_not_allowed" });

    // Storage-layer dedup: same KB + same origin + same hash is the same
    // document (110-processing 7). Checked in the service so a duplicate returns
    // a clear error rather than surfacing as a unique-constraint violation.
    if (input.contentHash) {
      const exists = await this.store.documentExists(
        input.kbId,
        input.source,
        input.connectorCode ?? null,
        input.contentHash,
      );
      if (exists) return err({ code: "duplicate_document" });
    }
    return ok(await this.store.createDocument(input));
  }

  async getDocument(id: string): Promise<Result<DocumentRow>> {
    const d = await this.store.getDocument(id);
    return d ? ok(d) : err({ code: "not_found" });
  }

  async listDocuments(kbId: string): Promise<DocumentRow[]> {
    return this.store.listDocuments(kbId);
  }

  async transitionDocument(
    id: string,
    to: ContentState,
    failureReason?: string,
  ): Promise<Result<DocumentRow>> {
    const d = await this.store.getDocument(id);
    if (!d) return err({ code: "not_found" });
    if (!canTransitionContent("document", d.contentState, to)) {
      return err({ code: "illegal_transition", from: d.contentState, to });
    }
    const updated = await this.store.setDocumentState(id, to, failureReason ?? null);
    return updated ? ok(updated) : err({ code: "not_found" });
  }

  // --- entries ---------------------------------------------------------------

  /**
   * Create an Entry against a content template. The template's required fields
   * must be present and no unknown field may be supplied - the template is the
   * contract for the entry's shape, and validating here keeps a malformed entry
   * out of the index rather than discovering it at retrieval time.
   */
  async createEntry(
    input: CreateEntryInput,
    template: ContentPreset,
  ): Promise<Result<EntryRow>> {
    const shape = validateEntryFields(input.fields, template);
    if (shape) return err(shape);
    return ok(await this.store.createEntry(input));
  }

  async getEntry(id: string): Promise<Result<EntryRow>> {
    const e = await this.store.getEntry(id);
    return e ? ok(e) : err({ code: "not_found" });
  }

  async listEntries(kbId: string): Promise<EntryRow[]> {
    return this.store.listEntries(kbId);
  }

  /**
   * Edit an entry's fields. Only legal while the entry is still editable - an
   * entry that has been submitted (left draft) is content the index depends on,
   * so field edits go through a resubmit, not an in-place mutation. KD-003:
   * publish state does not gate this; ownership does, and that check is the
   * caller's (route) responsibility since the store does not see actors.
   */
  async editEntryFields(
    id: string,
    fields: Record<string, unknown>,
    template: ContentPreset,
  ): Promise<Result<EntryRow>> {
    const e = await this.store.getEntry(id);
    if (!e) return err({ code: "not_found" });
    if (e.contentState !== "draft") {
      return err({ code: "illegal_transition", from: e.contentState, to: "draft" });
    }
    const shape = validateEntryFields(fields, template);
    if (shape) return err(shape);
    const updated = await this.store.updateEntryFields(id, fields);
    return updated ? ok(updated) : err({ code: "not_found" });
  }

  /** Submit a draft entry for processing, or run any other legal transition. */
  async transitionEntry(id: string, to: ContentState): Promise<Result<EntryRow>> {
    const e = await this.store.getEntry(id);
    if (!e) return err({ code: "not_found" });
    if (!canTransitionContent("entry", e.contentState, to)) {
      return err({ code: "illegal_transition", from: e.contentState, to });
    }
    const updated = await this.store.setEntryState(id, to);
    return updated ? ok(updated) : err({ code: "not_found" });
  }
}

/** Validate a field map against a template. Returns the first error, or null. */
function validateEntryFields(
  fields: Record<string, unknown>,
  template: ContentPreset,
): ContentError | null {
  const declared = new Set(template.fields.map((f) => f.fieldName));
  for (const key of Object.keys(fields)) {
    if (!FIELD_NAME_RE.test(key)) return { code: "unknown_field", field: key };
    if (!declared.has(key)) return { code: "unknown_field", field: key };
  }
  for (const f of template.fields) {
    if (f.required) {
      const v = fields[f.fieldName];
      if (v === undefined || v === null || v === "") {
        return { code: "missing_required_field", field: f.fieldName };
      }
    }
  }
  return null;
}

// re-exported for callers assembling inputs
export type { CreateDocumentInput, CreateEntryInput, DocumentSource };
export { initialContentState, assertContentTransition };
