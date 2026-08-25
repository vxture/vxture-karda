import test from "node:test";
import assert from "node:assert/strict";
import { resolve, t } from "./index";
import { shell } from "./messages/shell";
import { common } from "./messages/common";

const LOCALES = ["zh-CN", "en-US"] as const;

// --- the contract the shape exists to enforce ---------------------------------

test("every message carries EVERY supported locale", () => {
  // This is the whole reason the catalog is keyed message-first rather than
  // locale-first: a per-locale file lets the two drift, and a missing key is
  // only a runtime blank. Here it is structural - but structure only helps if
  // something also checks it at runtime for hand-written entries.
  for (const [name, table] of [["shell", shell], ["common", common]] as const) {
    for (const [key, msg] of Object.entries(table)) {
      for (const loc of LOCALES) {
        const v = (msg as Record<string, unknown>)[loc];
        assert.ok(v !== undefined && v !== null, `${name}.${key} is missing ${loc}`);
      }
    }
  }
});

test("no message is left as an untranslated copy of the other language", () => {
  // A pair whose two halves are identical is almost always a placeholder
  // someone pasted and meant to come back to. Punctuation-only and
  // number-only values are legitimately identical, so they are exempt.
  const exempt = /^[\s\d\p{P}]*$/u;
  for (const [name, table] of [["shell", shell], ["common", common]] as const) {
    for (const [key, msg] of Object.entries(table)) {
      const zh = (msg as Record<string, unknown>)["zh-CN"];
      const en = (msg as Record<string, unknown>)["en-US"];
      if (typeof zh !== "string" || typeof en !== "string") continue;
      if (exempt.test(zh)) continue;
      assert.notEqual(zh, en, `${name}.${key} has the same text in both languages`);
    }
  }
});

test("the English half contains no CJK", () => {
  // The failure this catches is a half-done sweep: someone adds a key, fills
  // zh, and pastes zh into en to make it compile. Nothing else would notice.
  for (const [name, table] of [["shell", shell], ["common", common]] as const) {
    for (const [key, msg] of Object.entries(table)) {
      const en = (msg as Record<string, unknown>)["en-US"];
      if (typeof en !== "string") continue;
      assert.ok(!/[\u4e00-\u9fff]/.test(en), `${name}.${key} en-US contains CJK: ${en}`);
    }
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
