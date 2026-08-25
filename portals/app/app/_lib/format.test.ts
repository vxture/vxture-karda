import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sharingMeta,
  contentStateMeta,
  verificationMeta,
  formatInterval,
  processingHint,
  formatBytes,
  formatWhen,
  apiErrorMessage,
  toneGlyph,
  PUBLISH_ORDER,
} from "./format";

test("sharing ladder: each publish state has a distinct label and tone, ordered private->org", () => {
  assert.deepEqual(PUBLISH_ORDER, ["private", "ws_published", "org_published"]);
  assert.equal(sharingMeta("private").label, "私有");
  assert.equal(sharingMeta("ws_published").label, "工作区");
  assert.equal(sharingMeta("org_published").label, "组织");
  assert.equal(sharingMeta("org_published").tone, "ok");
});

test("content state tone: processing warns, indexed ok, failed bad", () => {
  assert.equal(contentStateMeta("processing").tone, "warn");
  assert.equal(contentStateMeta("indexed").tone, "ok");
  assert.equal(contentStateMeta("failed").tone, "bad");
  // an unknown state degrades gracefully rather than throwing
  assert.equal(contentStateMeta("something_new").label, "something_new");
});

test("verification tone: verified ok, stale warns, unverified muted", () => {
  assert.equal(verificationMeta("verified").tone, "ok");
  assert.equal(verificationMeta("stale").tone, "warn");
  assert.equal(verificationMeta("unverified").tone, "muted");
  assert.equal(verificationMeta("verified").label, "已验证");
});

test("formatInterval reads as a cadence; blank/zero = verify-once", () => {
  assert.equal(formatInterval(30), "每 30 天");
  assert.equal(formatInterval(1), "每 1 天");
  assert.match(formatInterval(null), /一次性/);
  assert.match(formatInterval(0), /一次性/);
});

test("processing hint appears only while parked in processing (the A1 wait)", () => {
  assert.ok(processingHint("processing"));
  assert.equal(processingHint("indexed"), null);
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
  assert.equal(formatWhen("2026-07-26T03:37:50.198Z"), "2026-07-26 03:37");
  assert.equal(formatWhen(null), "-");
  assert.equal(formatWhen("not-a-date"), "-");
});

test("apiErrorMessage maps the statuses the product actually surfaces", () => {
  assert.match(apiErrorMessage(401), /重新登录/);
  assert.match(apiErrorMessage(403, "forbidden"), /权限/);
  assert.match(apiErrorMessage(409, "duplicate_document"), /已经在库里/);
  assert.match(apiErrorMessage(409, "name_taken"), /同名的库/);
  assert.match(apiErrorMessage(500), /服务端/);
});

test("toneGlyph is total over the tone union", () => {
  for (const t of ["ok", "warn", "bad", "info", "muted"] as const) {
    assert.equal(typeof toneGlyph(t), "string");
    assert.ok(toneGlyph(t).length > 0);
  }
});

// --- binding errors (batch 12) -----------------------------------------------

test("binding_exists names BOTH causes, because the second one surprises people", () => {
  // uidx_binding_kb_connector_source has no state predicate, so a REVOKED
  // binding keeps its row and permanently occupies that identifier for the
  // library. "和已存在的内容冲突" would leave the owner retrying forever.
  const msg = apiErrorMessage(409, "binding_exists");
  assert.match(msg, /撤销/, "must mention that a revoked source keeps the identifier");
  assert.match(msg, /不可逆|无法重新绑定/);
  assert.notEqual(msg, apiErrorMessage(409), "it must not fall through to the generic 409 wording");
});

test("illegal_transition says WHY, not just that it failed", () => {
  const msg = apiErrorMessage(409, "illegal_transition");
  assert.match(msg, /终态|无法恢复/);
});

test("an unrecognised 409 still gets the generic conflict wording", () => {
  assert.match(apiErrorMessage(409, "something_else"), /冲突/);
});
