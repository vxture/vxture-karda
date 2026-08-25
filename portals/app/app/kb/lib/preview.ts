// What karda will render in place, and what it will only hand over as a file.
//
// ONE list, two consumers: the download route uses it to pick the
// content-disposition, and the viewer uses it to decide whether to mount a frame
// or offer a download instead. A second copy would drift, and the drift is
// silent in the worst direction - a viewer that frames a type the server sends
// as `attachment` shows the user an empty box, or starts a download they did not
// ask for.
//
// The allow-list is small on purpose, and the reason is not politeness about
// unsupported formats: serving arbitrary UPLOADED content inline from our own
// origin is how stored XSS happens. text/html and image/svg+xml both execute
// script, and inline means that script runs against this origin's session. They
// are excluded permanently - not "not yet supported".

export const INLINE_SAFE_MIME = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

const SAFE = new Set<string>(INLINE_SAFE_MIME);

/** Strip parameters and case so `text/plain; charset=utf-8` matches - and so the
 *  same normalisation cannot be used to smuggle `text/html` past the list. */
export function baseMime(mime: string | null | undefined): string {
  return (mime ?? "").split(";")[0].trim().toLowerCase();
}

/** True if this type may be rendered in place. A missing mime is NOT inline: we
 *  do not guess a type for content we are about to execute in our own origin. */
export function canPreviewInline(mime: string | null | undefined): boolean {
  return SAFE.has(baseMime(mime));
}

/** The content-disposition the download route should send. Lives here, beside
 *  the list it consults, because a Next route module may only export route
 *  handlers - and because the decision and the list belong together anyway. */
export function inlineDisposition(mime: string | null | undefined, wantInline: boolean): "inline" | "attachment" {
  if (!wantInline) return "attachment";
  return canPreviewInline(mime) ? "inline" : "attachment";
}

/**
 * The content-type to send when serving inline.
 *
 * A browser rendering `text/plain` with NO charset falls back to the platform's
 * legacy codepage, not UTF-8 - so a Chinese document uploaded as `text/plain`
 * previews as mojibake on a GBK/Windows-1252 machine while the stored bytes are
 * perfectly fine. Browsers omit the charset when they set the type from a file
 * extension, which is every .txt/.md/.csv upload, so this is the common case
 * rather than the edge one.
 *
 * We only ADD a charset where none was declared, and only for text/*: overriding
 * a charset the uploader actually stated would corrupt content that is genuinely
 * not UTF-8, and a binary type has no charset to speak of. UTF-8 is the right
 * assumption because it is what the rest of the pipeline already decodes these
 * bytes as.
 */
export function inlineContentType(mime: string | null | undefined): string {
  const raw = (mime ?? "").trim();
  if (!raw) return "application/octet-stream";
  if (!baseMime(raw).startsWith("text/")) return raw;
  if (/;\s*charset=/i.test(raw)) return raw;
  return `${raw}; charset=utf-8`;
}

/** How the viewer should present it. `image` gets an <img> rather than a frame:
 *  a frame around an image inherits the browser's own centred-on-grey chrome,
 *  which reads as a broken page inside a dialog. */
export type PreviewKind = "pdf" | "image" | "text" | "none";

export function previewKind(mime: string | null | undefined): PreviewKind {
  const m = baseMime(mime);
  if (!SAFE.has(m)) return "none";
  if (m === "application/pdf") return "pdf";
  if (m.startsWith("image/")) return "image";
  return "text";
}
