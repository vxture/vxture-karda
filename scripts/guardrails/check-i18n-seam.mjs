#!/usr/bin/env node
// i18n seam guardrail.
//
// THE RULE: inside a SWEPT directory, no product string may be written in the
// source. The catalog (`app/_i18n/messages/`) is the only place a Chinese
// sentence is allowed to live, and every rendering site reads it through
// `useMessages` / `useFormat`.
//
// THE CRITERION is deliberately crude - CJK characters outside comments - and
// it is crude on purpose. A subtler check ("does this string look like copy?")
// would have judgement calls in it, and a guard with judgement calls is a guard
// people argue with. This one has a single, mechanical answer, and its failure
// mode is a false positive that costs one line in EXEMPT with a written reason.
//
// THE SCOPE GROWS WITH THE SWEEP. Listing directories rather than guarding the
// whole app is what lets this land before the app is fully swept: an unswept
// domain is not silently exempt, it is visibly absent from SCOPE, and the entry
// that adds it is the same PR that sweeps it.
//
// Note the criterion catches only ONE direction - Chinese left in source. The
// mirror failure (an English DS default reaching a Chinese screen because
// nobody passed a label) is not visible to a text scan; `catalog.test.ts`
// covers what it can of that, and a screenshot covers the rest.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const APP = "portals/app/app";

/**
 * What has been swept. A directory covers everything under it; a single FILE
 * may be listed too, which is what the 知识资产 domain needs - its root page
 * sits in `(portal)/` beside the domains that have not been swept yet, so the
 * directory cannot be claimed while one file in it can.
 */
const SCOPE = [
  `${APP}/(portal)/assets`,
  // 首页与知识资产分开之后(KD-214):`page.tsx` 是首页,资产总览搬进 `(portal)/assets`。
  // 两个都在扫描面内——分家不是放松,是把同一条纪律铺到两处。
  `${APP}/(portal)/page.tsx`,
  `${APP}/(portal)/home-client.tsx`,
  `${APP}/(portal)/home-hero.tsx`,
  `${APP}/_lib`,
  `${APP}/(portal)/channels`,
  `${APP}/(portal)/tools`,
  `${APP}/(portal)/bench`,
  `${APP}/(portal)/pipeline`,
  `${APP}/(portal)/evaluation`,
  `${APP}/_i18n`,
  `${APP}/_shell`,
];
// Every product surface is now in scope. The list stays explicit rather than
// becoming "the whole app": a new domain has to be ADDED here, which is the
// moment someone notices it has not been swept.

/** The catalog itself: the one place product strings are supposed to live. */
const CATALOG = `${APP}/_i18n/messages`;

/**
 * Files inside SCOPE that still hold a product string, each with the reason it
 * cannot be swept yet. An entry here is a debt, not a dispensation - it names
 * what has to change for the line to go away.
 */
const EXEMPT = [];
// Empty, and worth keeping that way. It held the two server-rendered
// `page.tsx` titles until 2026-08-26; three more were about to join them,
// which is what made the shape wrong. A page title now reads its words from
// the catalog and resolves them at `BRAND.defaultLocale`, so the source holds
// no product string and the guard has nothing to forgive. TD-014 - the title
// not FOLLOWING a language switch - is unchanged and still open, but it is now
// one locale argument rather than five exempted files.

// Ideographs AND the fullwidth punctuation that travels with them. The
// punctuation half was missing at first, which left a real hole: a JSX text
// node that is nothing but a separator - a `\u3001` between two interpolations, or
// a trailing `\u3002` - is a product string with no ideograph anywhere in it.
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff01-\uff60]/;

/** Line-level escape hatch: `// i18n-allow: <reason>` in the comment block
 *  directly above the line. A reason is REQUIRED - an unexplained pragma is how
 *  a guard rots - and a reason worth writing is usually more than one line, so
 *  the pragma may head a multi-line comment rather than having to be its last
 *  line. Use it for text that must stay Chinese in EVERY locale (a language's
 *  own name, a proper noun); anything else belongs in the catalog. */
const ALLOW = /^\s*\/\/\s*i18n-allow:\s*(\S.*)$/;
const COMMENT_LINE = /^\s*\/\//;
/** 块注释的行:`/*`、`/**` 的开头,以及以 `*` 起头的续行。 */
const BLOCK_COMMENT_LINE = /^\s*(\/\*|\*)/;

/** Walk up the contiguous `//` block above line `i` looking for the pragma. */
function allowedAbove(raw, i) {
  for (let j = i - 1; j >= 0 && COMMENT_LINE.test(raw[j]); j -= 1) {
    if (ALLOW.test(raw[j])) return true;
  }
  return false;
}

/** Blank out comments and JSX comment blocks so prose ABOUT the code is free.
 *  Explaining a decision in Chinese is not a product string, and forcing those
 *  comments into English would cost more than the guard is worth.
 *
 *  Block comments are replaced by their OWN newlines rather than by nothing,
 *  so line numbers survive the strip. Collapsing them shifted every reported
 *  line in a file that had one - which, in this repo, is every file. */
function stripComments(src) {
  const blanked = (m) => m.replace(/[^\n]/g, "");
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, blanked)
    .replace(/\/\*[\s\S]*?\*\//g, blanked)
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * Findings for ONE file's source text: `{ line, text }`, 1-indexed.
 *
 * Pure, and exported, so the guard's own rules can be tested without a
 * filesystem. The two bugs this function has already had - collapsed line
 * numbers, and a character class that missed fullwidth punctuation - were both
 * invisible precisely because nothing tested it.
 */
export function scanSource(src) {
  const raw = src.split("\n");
  const lines = stripComments(src).split("\n");
  const out = [];
  lines.forEach((line, i) => {
    if (!CJK.test(line)) return;
    if (allowedAbove(raw, i)) return;
    out.push({ line: i + 1, text: line.trim() });
  });
  return out;
}

// --- 目录里不许写 markdown ----------------------------------------------------
//
// 目录里的句子被当作纯文本渲染,没有任何一处把它交给 markdown。所以一句
// 「(星号)(星号)这不是授权问题(星号)(星号)」会把两对星号原样送到屏幕上。
//
// 这一条值得上机器检查,是因为它穿过每一道关:type-check 过、单测过、build 过
// ——句子只是个字符串,谁都不会觉得它有问题。它是靠真库截图抓到的(2026-08-28,
// `states.blockerModelNotRoutable`),而截图不是每次都有人看。
//
// 只查强调标记。目录里出现链接语法之类是另一回事,真需要时再单独立规矩。
const MARKDOWN = /(\*\*[^*\n]+\*\*|__[^_\n]+__)/;

/** 目录文件里带 markdown 强调的行。返回 [{line, text}]。 */
export function scanCatalog(src) {
  const out = [];
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    // 注释里写 markdown 是给读代码的人看的,不会被渲染,随意。
    //
    // `//` 之外还要认**块注释**:`/** ... */` 的续行以 `*` 开头,既不是 `//` 也不是
    // 字符串。第一版漏了这一种,于是给一个目录键写 JSDoc 说明时当场误报——一个会对
    // 正确写法报错的护栏,人的第一反应是绕开它,而不是修它。
    if (COMMENT_LINE.test(raw) || BLOCK_COMMENT_LINE.test(raw)) continue;
    if (MARKDOWN.test(raw)) out.push({ line: i + 1, text: raw.trim() });
  }
  return out;
}

/** How many lines the pragma let through - reported so an escape hatch that is
 *  quietly filling up is visible in the guard's own output. */
export function countAllowed(src) {
  const raw = src.split("\n");
  const lines = stripComments(src).split("\n");
  let n = 0;
  lines.forEach((line, i) => {
    if (CJK.test(line) && allowedAbove(raw, i)) n += 1;
  });
  return n;
}

export { CJK, stripComments, allowedAbove, MARKDOWN };

/** A SCOPE entry is a directory to walk, or a single file to scan. */
function filesIn(entry) {
  const abs = join(root, entry);
  try {
    if (!statSync(abs).isDirectory()) return [abs];
  } catch {
    // A SCOPE entry that no longer exists is a rename nobody finished; say so
    // rather than silently scanning zero files.
    console.error(`i18n seam: SCOPE entry does not exist - ${entry}`);
    process.exit(1);
  }
  return walk(abs);
}

function walk(dir, out = []) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

// Everything below runs only when this file IS the command; importing it (the
// test does) must not walk the tree or exit the process.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const exemptSet = new Set(EXEMPT.map((e) => e.file.replace(/\\/g, "/")));
  const failures = [];
  let scanned = 0;
  let allowed = 0;

  // 目录本身单独扫一遍:上面那轮 `continue` 掉了目录,因为它查的是「产品串跑到了
  // 目录外面」;这一轮查的是相反方向的问题——串在目录里,但写法渲染不出来。
  const markdown = [];
  for (const abs of filesIn(CATALOG)) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    for (const hit of scanCatalog(readFileSync(abs, "utf8"))) {
      markdown.push(`${rel}:${hit.line}  ${hit.text.slice(0, 90)}`);
    }
  }

  for (const scope of SCOPE) {
    for (const abs of filesIn(scope)) {
      const rel = relative(root, abs).replace(/\\/g, "/");
      if (rel.startsWith(CATALOG)) continue;
      if (exemptSet.has(rel)) continue;
      scanned += 1;
      const src = readFileSync(abs, "utf8");
      const found = scanSource(src);
      allowed += countAllowed(src);
      for (const { line, text } of found) failures.push(`${rel}:${line}  ${text.slice(0, 90)}`);
    }
  }

  // An exemption for a file that no longer holds a product string is stale -
  // and a stale exemption is how a guard quietly stops guarding.
  const stale = EXEMPT.filter((e) => {
    try {
      return !CJK.test(stripComments(readFileSync(join(root, e.file), "utf8")));
    } catch {
      return true;
    }
  });

  if (failures.length || stale.length || markdown.length) {
    if (failures.length) {
      console.error(`i18n seam: ${failures.length} product string(s) outside the catalog\n`);
      for (const f of failures) console.error("  " + f);
      console.error(
        "\nMove the text into `app/_i18n/messages/<namespace>.ts` and render it " +
          "through `useMessages`. If ONE line genuinely must stay Chinese in " +
          "every locale (a language's own name, a proper noun), put " +
          "`// i18n-allow: <reason>` directly above it. Whole-file exemptions go " +
          "in EXEMPT, and are a last resort.",
      );
    }
    if (markdown.length) {
      console.error(
        `\ni18n catalog: ${markdown.length} line(s) carry markdown emphasis - it renders as literal asterisks:`,
      );
      for (const f of markdown) console.error("  " + f);
      console.error("\nStrong wording, not markup: catalog strings are rendered as PLAIN TEXT.");
    }
    if (stale.length) {
      console.error(`\nStale EXEMPT entr${stale.length === 1 ? "y" : "ies"} - the file is clean now, drop the entry:`);
      for (const e of stale) console.error("  " + e.file);
    }
    process.exit(1);
  }

  console.log(
    `i18n seam OK - ${scanned} file(s) across ${SCOPE.length} swept scope(s), ` +
      `${allowed} allowed line(s), ${EXEMPT.length} exempt file(s); catalog free of markdown`,
  );
}
