import test from "node:test";
import assert from "node:assert/strict";
import { INLINE_SAFE_MIME, inlineContentType, inlineDisposition, previewKind } from "./preview";

test("inline is opt-in - without the flag everything is an attachment", () => {
  assert.equal(inlineDisposition("application/pdf", false), "attachment");
  assert.equal(inlineDisposition("text/plain", false), "attachment");
});

test("the useful types render in place", () => {
  for (const mime of ["application/pdf", "text/plain", "text/markdown", "text/csv", "image/png", "image/jpeg"]) {
    assert.equal(inlineDisposition(mime, true), "inline", mime);
  }
});

test("HTML and SVG are NEVER inline - they execute script against our origin", () => {
  // This is the serious half of the allow-list. An uploaded document rendered
  // inline from our own origin runs with this origin's session; text/html and
  // SVG are the classic stored-XSS vehicles.
  assert.equal(inlineDisposition("text/html", true), "attachment");
  assert.equal(inlineDisposition("image/svg+xml", true), "attachment");
  assert.equal(inlineDisposition("application/xhtml+xml", true), "attachment");
});

test("a type we cannot render inline just downloads - nothing is lost", () => {
  assert.equal(inlineDisposition("application/vnd.openxmlformats-officedocument.wordprocessingml.document", true), "attachment");
  assert.equal(inlineDisposition("application/zip", true), "attachment");
});

test("charset parameters and casing do not defeat the allow-list", () => {
  // `text/plain; charset=utf-8` is what a real upload carries.
  assert.equal(inlineDisposition("text/plain; charset=utf-8", true), "inline");
  assert.equal(inlineDisposition("TEXT/PLAIN", true), "inline");
  assert.equal(inlineDisposition("  application/pdf  ", true), "inline");
  // ...and it must not let HTML back in by the same trick.
  assert.equal(inlineDisposition("text/html; charset=utf-8", true), "attachment");
});

test("a missing mime falls back to attachment, not to a guess", () => {
  assert.equal(inlineDisposition(null, true), "attachment");
  assert.equal(inlineDisposition(undefined, true), "attachment");
  assert.equal(inlineDisposition("", true), "attachment");
});

test("the route's disposition and the viewer's kind agree, type for type", () => {
  // The bug this pins: if the two ever disagree, the viewer frames something the
  // server sends as `attachment` - an empty box, or a download nobody asked for.
  for (const mime of [...INLINE_SAFE_MIME, "text/html", "image/svg+xml", "application/zip", "", null]) {
    const framed = previewKind(mime) !== "none";
    const served = inlineDisposition(mime, true) === "inline";
    assert.equal(framed, served, `${mime} disagrees`);
  }
});

// --- inline content-type ------------------------------------------------------

test("inline text gets an explicit UTF-8 charset", () => {
  // Without it the browser decodes with the platform codepage, and a Chinese
  // document previews as mojibake while the stored bytes are fine. Browsers omit
  // the charset whenever they type a file by extension, so this is the common
  // case for .txt/.md/.csv uploads, not an edge one.
  assert.equal(inlineContentType("text/plain"), "text/plain; charset=utf-8");
  assert.equal(inlineContentType("text/markdown"), "text/markdown; charset=utf-8");
  assert.equal(inlineContentType("text/csv"), "text/csv; charset=utf-8");
});

test("a charset the uploader DID state is left alone", () => {
  // Overriding it would corrupt content that is genuinely not UTF-8.
  assert.equal(inlineContentType("text/plain; charset=gb18030"), "text/plain; charset=gb18030");
  assert.equal(inlineContentType("text/plain;charset=ISO-8859-1"), "text/plain;charset=ISO-8859-1");
  assert.equal(inlineContentType("text/plain; CHARSET=utf-16"), "text/plain; CHARSET=utf-16");
});

test("non-text types are passed through untouched - they have no charset", () => {
  assert.equal(inlineContentType("application/pdf"), "application/pdf");
  assert.equal(inlineContentType("image/png"), "image/png");
});

test("a missing mime becomes octet-stream, never a guessed text type", () => {
  assert.equal(inlineContentType(null), "application/octet-stream");
  assert.equal(inlineContentType(undefined), "application/octet-stream");
  assert.equal(inlineContentType("   "), "application/octet-stream");
});
