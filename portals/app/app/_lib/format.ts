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

// Tone is STRUCTURE, not language: which states read as good, neutral or bad is
// a fact about the state machine and identical in every locale. Labels moved to
// `_i18n/messages/states` and are bound by `useFormat()`; keeping the tones here
// means that judgement is written once instead of once per language.
export const SHARING_TONE: Record<PublishState, Tone> = {
  private: "muted",
  ws_published: "info",
  org_published: "ok",
};

export const PUBLISH_ORDER: PublishState[] = ["private", "ws_published", "org_published"];

// --- document content state ---------------------------------------------------

export type ContentState = "draft" | "processing" | "indexed" | "failed" | "archived" | "deleted";

export interface StateMeta {
  label: string;
  tone: Tone;
}

export const CONTENT_TONE: Record<ContentState, Tone> = {
  draft: "muted",
  processing: "warn",
  indexed: "ok",
  failed: "bad",
  archived: "muted",
  deleted: "muted",
};

// --- verification (governance) state -----------------------------------------

export type VerificationState = "unverified" | "verified" | "stale";

export const VERIFICATION_TONE: Record<VerificationState, Tone> = {
  unverified: "muted",
  verified: "ok",
  // A stale item was verified once but its interval lapsed - the default quality
  // tier stops recalling it, so it reads as an attention state, not an error.
  stale: "warn",
};

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

/** ISO timestamp -> "YYYY-MM-DD HH:mm" in UTC. Deterministic (input-only).
 *
 *  Kept for non-component callers and for tests that need a fixed rendering.
 *  Components use `useFormat().when()`, which formats through Intl in the
 *  reader's locale - a timestamp is one of the few things that genuinely must
 *  differ between zh-CN and en-US. */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

// --- API error wording --------------------------------------------------------

/** Turn an API failure (status + optional error code) into a human message. */
