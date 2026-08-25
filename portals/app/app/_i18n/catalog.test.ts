import test from "node:test";
import assert from "node:assert/strict";
import { resolve, t } from "./index";
import { shell } from "./messages/shell";
import { common } from "./messages/common";
import { NAMESPACES } from "./messages/registry";

const LOCALES = ["zh-CN", "en-US"] as const;

/**
 * Arguments for the interpolated messages, keyed `namespace.key`.
 *
 * An entry here is REQUIRED for every function-valued message: the earlier
 * version of these tests skipped anything that was not a string, which meant a
 * `MessageFn` whose English half returned Chinese passed every check. Requiring
 * a probe turns "someone added a function" into a failing test rather than a
 * silent gap.
 */
const PROBES: Record<string, unknown[]> = {
  "common.documentCount": [3],
  "common.itemCount": [5],
  "assets.failedCount": [2],
  "assets.verifiedWhen": ["2026-08-25 10:00"],
  "assets.metaDocs": [4],
  "assets.metaFailed": [1],
  "assets.okUpload": ["report.pdf"],
  "assets.okVerifyDoc": ["report.pdf"],
  "assets.okReprocess": ["report.pdf"],
  "assets.okBind": ["Confluence", "SPACE-1"],
  "assets.okRevoke": ["SPACE-1", 3],
  "assets.okShare": ["Workspace"],
  "assets.okFolderDelete": ["Policies"],
  "assets.syncedWhen": ["2026-08-25 10:00"],
  "assets.cursorLabel": ["c-91"],
  "assets.revokeConsequence": [12, 3],
  "assets.templateSpec": [512, 1024],
  "assets.fieldsBudget": [3, 8],
  "assets.fieldsSystemDims": [2, ["kb_id", "folder_id"]],
  "assets.fieldFilterableAria": ["owner"],
  "assets.govOn": ["every 30 days"],
  "assets.folderRenameAria": ["Policies"],
  "states.recordLapsedDays": [30],
  "states.recordOverdueDays": [12],
  "states.recordDueDays": [7],
  "states.intervalEvery": [30],
};

/** Every message in every namespace, already flattened to comparable strings. */
function* entries(): Generator<{ path: string; zh: string; en: string }> {
  for (const [ns, table] of Object.entries(NAMESPACES)) {
    for (const [key, msg] of Object.entries(table as Record<string, unknown>)) {
      const path = `${ns}.${key}`;
      const halves = msg as Record<string, unknown>;
      const zh = halves["zh-CN"];
      const en = halves["en-US"];
      assert.ok(zh !== undefined && zh !== null, `${path} is missing zh-CN`);
      assert.ok(en !== undefined && en !== null, `${path} is missing en-US`);

      if (typeof zh === "function" || typeof en === "function") {
        const args = PROBES[path];
        assert.ok(args, `${path} is interpolated but has no PROBES entry - add one`);
        assert.equal(typeof zh, "function", `${path} zh-CN must also be a function`);
        assert.equal(typeof en, "function", `${path} en-US must also be a function`);
        yield {
          path,
          zh: (zh as (...a: unknown[]) => string)(...args),
          en: (en as (...a: unknown[]) => string)(...args),
        };
        continue;
      }
      yield { path, zh: zh as string, en: en as string };
    }
  }
}

// --- the contract the shape exists to enforce ---------------------------------

test("every message carries EVERY supported locale", () => {
  // This is the whole reason the catalog is keyed message-first rather than
  // locale-first: a per-locale file lets the two drift, and a missing key is
  // only a runtime blank. `entries()` asserts presence as it walks.
  let n = 0;
  for (const _ of entries()) n += 1;
  assert.ok(n > 0, "the registry resolved to no messages at all");
});

test("no message is left as an untranslated copy of the other language", () => {
  // A pair whose two halves are identical is almost always a placeholder
  // someone pasted and meant to come back to. Punctuation-only and
  // number-only values are legitimately identical, so they are exempt.
  const exempt = /^[\s\d\p{P}]*$/u;
  for (const { path, zh, en } of entries()) {
    if (exempt.test(zh)) continue;
    assert.notEqual(zh, en, `${path} has the same text in both languages`);
  }
});

test("the English half contains no CJK", () => {
  // The failure this catches is a half-done sweep: someone adds a key, fills
  // zh, and pastes zh into en to make it compile. Nothing else would notice -
  // and for an interpolated message, nothing did, until PROBES.
  for (const { path, en } of entries()) {
    assert.ok(!/[\u4e00-\u9fff]/.test(en), `${path} en-US contains CJK: ${en}`);
  }
});

test("the Chinese half of a product string is not left in English", () => {
  // The mirror failure, and the likelier one now that DS ships English
  // defaults: a key gets its English filled from the DS default and the
  // Chinese never written. Proper nouns and pure symbols are legitimately
  // shared, so only a zh half that is IDENTICAL to a multi-word English
  // sentence is treated as unwritten - single tokens are exempt.
  for (const { path, zh, en } of entries()) {
    if (!/[a-zA-Z]/.test(zh)) continue;
    if (/[\u4e00-\u9fff]/.test(zh)) continue;
    assert.ok(
      !(zh === en && en.trim().split(/\s+/).length > 1),
      `${path} zh-CN looks unwritten: ${zh}`,
    );
  }
});

// --- resolution ---------------------------------------------------------------

test("resolve binds one locale's half of a whole namespace", () => {
  const zh = resolve(shell, "zh-CN");
  const en = resolve(shell, "en-US");
  assert.equal(zh.navAssets, "知识资产");
  assert.equal(en.navAssets, "Knowledge assets");
});

test("interpolated messages resolve to a CALLABLE, not a string", () => {
  // Word order is not shared between languages - Chinese puts the quantifier
  // where English puts a plural suffix - so these are functions per locale
  // rather than one template with placeholders.
  const zh = resolve(common, "zh-CN");
  const en = resolve(common, "en-US");
  assert.equal(zh.documentCount(3), "3 份文档");
  assert.equal(en.documentCount(3), "3 documents");
  assert.equal(en.documentCount(1), "1 document", "English needs the singular; Chinese does not distinguish");
  assert.equal(zh.documentCount(1), "1 份文档");
});

test("t() reads one message without binding a namespace", () => {
  assert.equal(t(shell.navChannels, "en-US"), "Supply channels");
});
