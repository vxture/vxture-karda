import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { matchesSourceSpan, MAX_SEMANTIC_SOURCE_BYTES, verifiedSourceText, type SourceTextMetadata } from "./source-text";

const bytes = Buffer.from("A\r\n\u4e2d\ud83d\ude00B");
const metadata: SourceTextMetadata = { activeVersion: 2, contentState: "indexed", mime: "text/plain",
  contentHash: createHash("sha256").update(bytes).digest("hex") };

test("source text uses verified bytes and the parser's UTF-16 canonical offsets", () => {
  const text = verifiedSourceText(metadata, bytes)!;
  assert.equal(text, "A\n\u4e2d\ud83d\ude00B");
  assert.equal(text.length, 6);
  assert.equal(matchesSourceSpan(text, 2, 5, "\u4e2d\ud83d\ude00"), true);
  assert.equal(matchesSourceSpan(text, 2, 4, "\u4e2d\ud83d\ude00"), false);
});

test("missing or mismatched bytes, non-current state and unsupported formats have no canonical fallback", () => {
  for (const patch of [{ activeVersion: null }, { activeVersion: 0 }, { activeVersion: 1.5 },
    { contentState: "deleted" }, { contentState: "archived" }, { contentState: "processing" },
    { mime: "application/pdf" }, { mime: null }, { contentHash: null }, { contentHash: "f".repeat(64) }]) {
    assert.equal(verifiedSourceText({ ...metadata, ...patch }, bytes), null);
  }
  assert.equal(verifiedSourceText(metadata, null), null);
  assert.equal(verifiedSourceText(metadata, Buffer.from("changed")), null);
  assert.equal(verifiedSourceText(metadata, Buffer.alloc(MAX_SEMANTIC_SOURCE_BYTES + 1)), null);
});

test("span anchors must match the exact same-version canonical passage", () => {
  for (const [start, end, excerpt] of [[-1, 1, "A"], [1, 1, ""], [0, 100, "A"], [0.5, 1, "A"],
    [0, 1, "wrong"], [NaN, 2, "A"]] as const) assert.equal(matchesSourceSpan("ABC", start, end, excerpt), false);
  assert.equal(matchesSourceSpan("ABC", 0, 3, "ABC"), true);
});
