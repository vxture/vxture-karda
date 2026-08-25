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
  private: { label: "私有", tone: "muted", help: "只有你能看到这个库。" },
  ws_published: { label: "工作区", tone: "info", help: "本工作区成员可读。" },
  org_published: { label: "组织", tone: "ok", help: "组织内所有人可读。" },
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
  processing: { label: "加工中", tone: "warn" },
  indexed: { label: "已入藏", tone: "ok" },
  failed: { label: "失败", tone: "bad" },
  archived: { label: "已归档", tone: "muted" },
  deleted: { label: "已删除", tone: "muted" },
};

export function contentStateMeta(state: string): StateMeta {
  return CONTENT_STATE[state as ContentState] ?? { label: state, tone: "muted" };
}

// --- verification (governance) state -----------------------------------------

export type VerificationState = "unverified" | "verified" | "stale";

const VERIFICATION_STATE: Record<VerificationState, StateMeta> = {
  unverified: { label: "未验证", tone: "muted" },
  verified: { label: "已验证", tone: "ok" },
  // A stale item was verified once but its interval lapsed - the default quality
  // tier stops recalling it, so it reads as an attention state, not an error.
  stale: { label: "Stale", tone: "warn" },
};

export function verificationMeta(state: string): StateMeta {
  return VERIFICATION_STATE[state as VerificationState] ?? { label: state, tone: "muted" };
}

/** Re-verification cadence for display. null/0 = verify once, no expiry. */
export function formatInterval(days: number | null | undefined): string {
  if (!days || days <= 0) return "一次性（不过期）";
  return `每 ${days} 天`;
}

/**
 * While Atlas A1 (embedding) is unavailable the pipeline is embed-before-commit,
 * so an uploaded document legitimately parks in `processing` and never reaches
 * `indexed`. The Console says so rather than letting the user read the stall as a
 * fault - the document is captured and durable, it is waiting on a dependency.
 */
export function processingHint(state: string): string | null {
  return state === "processing"
    ? "已收下并入队。向量服务恢复前索引暂停——内容不会丢。"
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
  if (status === 401) return "登录已过期，请重新登录。";
  if (status === 403) return code === "forbidden" ? "你没有执行该操作的权限。" : "这个操作被拒绝了。";
  if (status === 404) return "没找到——它可能属于另一个工作区。";
  if (status === 409) {
    if (code === "duplicate_document") return "这份内容已经在库里了。";
    if (code === "name_taken") return "这个工作区里已经有同名的库了。";
    return "和已存在的内容冲突。";
  }
  if (code === "name_required") return "请填写名称。";
  if (status >= 500) return "服务端出错了，请重试。";
  return code ? `Request failed: ${code}` : `Request failed (HTTP ${status}).`;
}
