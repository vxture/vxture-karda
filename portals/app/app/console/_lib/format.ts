// Pure presentation helpers for the Console (track 10). Kept JSX-free and
// dependency-free so they are unit-testable under node:test - the UI components
// import these for every label and tone, so a library's "sharing" wording or a
// document's status colour is defined once here, not re-derived per component.

export type Tone = "ok" | "warn" | "bad" | "info" | "muted";

/** The badge glyph for a tone (mirrors the status page's vocabulary). */
export function toneGlyph(tone: Tone): string {
  return { ok: "\u{1F7E2}", warn: "\u{1F7E1}", bad: "\u{1F534}", info: "\u{1F535}", muted: "⚪" }[tone];
}

// --- library sharing (the publish ladder = the "grade" a library sits at) -----

export type PublishState = "private" | "ws_published" | "org_published";

export interface SharingMeta {
  label: string;
  tone: Tone;
  help: string;
}

const SHARING: Record<PublishState, SharingMeta> = {
  private: { label: "Private", tone: "muted", help: "Only you can see this library." },
  ws_published: { label: "Workspace", tone: "info", help: "Everyone in this workspace can read it." },
  org_published: { label: "Organization", tone: "ok", help: "Everyone in the organization can read it." },
};

export function sharingMeta(state: PublishState): SharingMeta {
  return SHARING[state] ?? { label: state, tone: "muted", help: "" };
}

export const PUBLISH_ORDER: PublishState[] = ["private", "ws_published", "org_published"];

// --- document content state ---------------------------------------------------

export type ContentState = "draft" | "processing" | "indexed" | "failed" | "archived" | "deleted";

export interface StateMeta {
  label: string;
  tone: Tone;
}

const CONTENT_STATE: Record<ContentState, StateMeta> = {
  draft: { label: "Draft", tone: "muted" },
  processing: { label: "Processing", tone: "warn" },
  indexed: { label: "Indexed", tone: "ok" },
  failed: { label: "Failed", tone: "bad" },
  archived: { label: "Archived", tone: "muted" },
  deleted: { label: "Deleted", tone: "muted" },
};

export function contentStateMeta(state: string): StateMeta {
  return CONTENT_STATE[state as ContentState] ?? { label: state, tone: "muted" };
}

/**
 * While Atlas A1 (embedding) is unavailable the pipeline is embed-before-commit,
 * so an uploaded document legitimately parks in `processing` and never reaches
 * `indexed`. The Console says so rather than letting the user read the stall as a
 * fault - the document is captured and durable, it is waiting on a dependency.
 */
export function processingHint(state: string): string | null {
  return state === "processing"
    ? "Captured and queued. Indexing is paused until the embedding service is available - nothing is lost."
    : null;
}

// --- byte / date formatting ---------------------------------------------------

export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n < 0) return "-";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  // One decimal below 10 (so 1.5 KB reads well), whole numbers above; either way
  // Number#toString drops a trailing ".0" so 5 MB is "5 MB", not "5.0 MB".
  const val = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10;
  return `${val} ${units[i]}`;
}

/** ISO timestamp -> "YYYY-MM-DD HH:mm" in UTC. Deterministic (input-only). */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// --- API error wording --------------------------------------------------------

/** Turn an API failure (status + optional error code) into a human message. */
export function apiErrorMessage(status: number, code?: string): string {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return code === "forbidden" ? "You do not have permission for that." : "That action was refused.";
  if (status === 404) return "Not found (it may belong to another workspace).";
  if (status === 409) {
    if (code === "duplicate_document") return "That exact content is already in this library.";
    if (code === "name_taken") return "A library with that name already exists in this workspace.";
    return "That conflicts with something that already exists.";
  }
  if (code === "name_required") return "A name is required.";
  if (status >= 500) return "The server hit an error. Please try again.";
  return code ? `Request failed: ${code}` : `Request failed (HTTP ${status}).`;
}
