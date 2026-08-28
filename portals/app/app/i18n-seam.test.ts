import { test } from "node:test";
import assert from "node:assert/strict";
import {
  scanSource,
  countAllowed,
  stripComments,
  scanCatalog,
} from "../../../scripts/guardrails/check-i18n-seam.mjs";

// The guard's own rules, tested without a filesystem. Both bugs pinned below
// shipped in the guard's first version and were invisible for exactly one
// reason: nothing tested it. A guard that lies is worse than no guard.

test("a product string in source is found, with its real line number", () => {
  const src = [
    "const a = 1;",
    'const label = "已验证";',
  ].join("\n");
  assert.deepEqual(scanSource(src), [{ line: 2, text: 'const label = "已验证";' }]);
});

test("comments are free - explaining a decision in Chinese is not a product string", () => {
  const src = ['// 这是说明，不是文案', "const a = 1;"].join("\n");
  assert.deepEqual(scanSource(src), []);
});

test("a block comment does not shift the reported line number", () => {
  // The first version replaced block comments with "", collapsing their lines,
  // so every finding after one was reported at the wrong place - and in this
  // repo every file has a block comment.
  const src = [
    "/**",
    " * 一段中文说明",
    " * 还有一行",
    " */",
    'const label = "未验证";',
  ].join("\n");
  const found = scanSource(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 5, "the finding is on line 5, not line 2");
});

test("stripComments preserves the line count", () => {
  const src = "/* a\nb\nc */\nx";
  assert.equal(stripComments(src).split("\n").length, src.split("\n").length);
});

test("fullwidth punctuation alone is a product string", () => {
  // A JSX separator - `、` between two interpolations, a trailing `。` - carries
  // no ideograph, so an ideograph-only character class waved it through.
  assert.equal(scanSource('const sep = "、";').length, 1);
  assert.equal(scanSource('const end = "。";').length, 1);
  assert.equal(scanSource('const q = "（可选）";').length, 1);
});

test("plain ASCII punctuation is not", () => {
  assert.deepEqual(scanSource('const sep = ", ";'), []);
});

test("the i18n-allow pragma exempts the line below it", () => {
  const src = ["// i18n-allow: a language names itself in its own script", 'nativeName: "简体中文",'].join("\n");
  assert.deepEqual(scanSource(src), []);
  assert.equal(countAllowed(src), 1);
});

test("the pragma may head a MULTI-LINE reason", () => {
  // A reason worth writing rarely fits on one line; requiring the pragma to be
  // the last comment line would push authors toward writing no reason at all.
  const src = [
    "// i18n-allow: a language picker names each language in its own script -",
    "// 简体中文 stays 简体中文 for an English reader, the way Deutsch stays",
    "// Deutsch for a Chinese one.",
    'nativeName: "简体中文",',
  ].join("\n");
  assert.deepEqual(scanSource(src), []);
});

test("a pragma with NO reason does not exempt anything", () => {
  const src = ["// i18n-allow:", 'const label = "已验证";'].join("\n");
  assert.equal(scanSource(src).length, 1, "an unexplained pragma is how a guard rots");
});

test("the pragma does not leak past a blank line", () => {
  // It exempts the line below its comment BLOCK, not everything that follows.
  const src = [
    "// i18n-allow: reason",
    'ok: "简体中文",',
    "",
    'leaked: "已验证",',
  ].join("\n");
  const found = scanSource(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 4);
});

// --- 目录里不许写 markdown ----------------------------------------------------
//
// 界面把目录里的句子当纯文本渲染,所以强调标记会原样出现在屏幕上。这一条
// 穿过 type-check、单测和 build——2026-08-28 是靠真库截图抓到的,而截图不是
// 每次都有人看。

test("目录里的强调标记会被抓出来,带真实行号", () => {
  const src = [
    "export const states = {",
    '  ok: { \"zh-CN\": \"不是授权问题——端点可能已授权\" },',
    '  bad: { \"zh-CN\": \"**不是授权问题**——端点可能已授权\" },',
    "};",
  ].join("\n");
  const found = scanCatalog(src);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 3);
});

test("下划线式强调也算", () => {
  const src = '  k: { \"en-US\": \"__not a grant problem__ - the endpoint may be granted\" },';
  assert.equal(scanCatalog(src).length, 1);
});

test("注释里写 markdown 不算 —— 那是给读代码的人看的,不会被渲染", () => {
  const src = [
    "  // 这里**必须**留着,测试钉着它",
    '  k: { \"zh-CN\": \"已收下并入队\" },',
  ].join("\n");
  assert.deepEqual(scanCatalog(src), []);
});

test("孤立的星号不算 —— 乘号、脚注符、通配符都是正常内容", () => {
  // 只有成对且中间有内容的才是强调。把单个星号也报出来,护栏会变成噪音,
  // 而人对噪音的处理办法是关掉它。
  assert.deepEqual(scanCatalog('  k: { \"en-US\": \"5 * 3 = 15\" },'), []);
  assert.deepEqual(scanCatalog('  k: { \"en-US\": \"see note *\" },'), []);
});

test("跨行的两个星号不算一对 —— 否则整份目录会被连成一片", () => {
  const src = ['  a: \"5 * 3\",', '  b: \"7 * 2\",'].join("\n");
  assert.deepEqual(scanCatalog(src), []);
});
