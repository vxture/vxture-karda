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

const root = resolve(new URL("../..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const APP = "portals/app/app";

/** Directories whose sweep has landed. Add one only in the PR that sweeps it. */
const SCOPE = [
  `${APP}/(portal)/assets`,
  `${APP}/_i18n`,
];
// NOT yet in scope, and each absence is a real debt rather than an oversight:
//   _shell            - AppHeader is swept, nav.ts / NavPane / ScopePanel /
//                       StewardDock are not, so the directory cannot be claimed.
//   (portal)/channels, /pipeline, /evaluation, /tools, /bench
//                     - their domain sweeps have not run.
// Each of those lands in SCOPE in the PR that sweeps it.

/** The catalog itself: the one place product strings are supposed to live. */
const CATALOG = `${APP}/_i18n/messages`;

/**
 * Files inside SCOPE that still hold a product string, each with the reason it
 * cannot be swept yet. An entry here is a debt, not a dispensation - it names
 * what has to change for the line to go away.
 */
const EXEMPT = [
  {
    file: `${APP}/(portal)/assets/[kbId]/page.tsx`,
    reason:
      "Next `metadata` is produced on the server, where the locale preference " +
      "(client-side, localStorage) is not readable. Needs a cookie-backed " +
      "server locale in the shell - see TD-014.",
  },
  {
    file: `${APP}/(portal)/assets/new/page.tsx`,
    reason: "Same as the asset detail page: server-rendered `metadata`, no server locale yet (TD-014).",
  },
];

const CJK = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/;

/** Blank out comments and JSX comment blocks so prose ABOUT the code is free.
 *  Explaining a decision in Chinese is not a product string, and forcing those
 *  comments into English would cost more than the guard is worth. */
function stripComments(src) {
  return src
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
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

const exemptSet = new Set(EXEMPT.map((e) => e.file.replace(/\\/g, "/")));
const failures = [];
let scanned = 0;

for (const scope of SCOPE) {
  for (const abs of walk(join(root, scope))) {
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (rel.startsWith(CATALOG)) continue;
    if (exemptSet.has(rel)) continue;
    scanned += 1;
    const lines = stripComments(readFileSync(abs, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (CJK.test(line)) failures.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
}

// An exemption for a file that no longer holds a product string is stale - and
// a stale exemption is how a guard quietly stops guarding.
const stale = EXEMPT.filter((e) => {
  try {
    return !CJK.test(stripComments(readFileSync(join(root, e.file), "utf8")));
  } catch {
    return true;
  }
});

if (failures.length || stale.length) {
  if (failures.length) {
    console.error(`i18n seam: ${failures.length} product string(s) outside the catalog\n`);
    for (const f of failures) console.error("  " + f);
    console.error(
      "\nMove the text into `app/_i18n/messages/<namespace>.ts` and render it " +
        "through `useMessages`. If it genuinely cannot move, add it to EXEMPT " +
        "in this file with the reason.",
    );
  }
  if (stale.length) {
    console.error(`\nStale EXEMPT entr${stale.length === 1 ? "y" : "ies"} - the file is clean now, drop the entry:`);
    for (const e of stale) console.error("  " + e.file);
  }
  process.exit(1);
}

console.log(`i18n seam OK - ${scanned} file(s) across ${SCOPE.length} swept scope(s), ${EXEMPT.length} exempt`);
