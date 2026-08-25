import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SHARING_TONE,
  CONTENT_TONE,
  VERIFICATION_TONE,
  formatBytes,
  formatWhen,
  toneGlyph,
  PUBLISH_ORDER,
} from "./format";

// What is left in format.ts is STRUCTURE: which tone a state carries, what
// order the ladder goes in, how many bytes are in a KB. The labels moved to
// `_i18n/messages/states.ts` and are asserted there, in both locales.

test("sharing ladder is ordered private->org and its tones climb with exposure", () => {
  assert.deepEqual(PUBLISH_ORDER, ["private", "ws_published", "org_published"]);
  assert.equal(SHARING_TONE.org_published, "ok");
  // every rung has a tone, so a new rung cannot render untoned
  for (const s of PUBLISH_ORDER) assert.ok(SHARING_TONE[s]);
});

test("content state tone: processing warns, indexed ok, failed bad", () => {
  assert.equal(CONTENT_TONE.processing, "warn");
  assert.equal(CONTENT_TONE.indexed, "ok");
  assert.equal(CONTENT_TONE.failed, "bad");
});

test("verification tone: verified ok, stale warns, unverified muted", () => {
  assert.equal(VERIFICATION_TONE.verified, "ok");
  assert.equal(VERIFICATION_TONE.stale, "warn");
  assert.equal(VERIFICATION_TONE.unverified, "muted");
});

test("formatBytes scales and guards bad input", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(1024), "1 KB");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5 MB");
  assert.equal(formatBytes(null), "-");
  assert.equal(formatBytes(-1), "-");
});

test("formatWhen renders UTC deterministically and guards junk", () => {
  // The UTC formatter is kept for non-component callers and for tests: the
  // locale-aware one lives in `useFormat().when` and depends on Intl + a
  // locale, neither of which a server-side caller has.
  assert.equal(formatWhen("2026-07-26T03:37:50.198Z"), "2026-07-26 03:37");
  assert.equal(formatWhen(null), "-");
  assert.equal(formatWhen("not-a-date"), "-");
});

test("toneGlyph is total over the tone union", () => {
  for (const t of ["ok", "warn", "bad", "info", "muted"] as const) {
    assert.equal(typeof toneGlyph(t), "string");
    assert.ok(toneGlyph(t).length > 0);
  }
});
