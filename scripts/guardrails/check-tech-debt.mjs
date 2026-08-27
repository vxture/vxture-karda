#!/usr/bin/env node
/**
 * check-tech-debt.mjs - every TD entry states its status, and the index agrees.
 *
 * Why: on 2026-08-27, closing out batch 15, an audit of the register found that
 * TD-007 / TD-008 / TD-009 all said the thing they describe was "not yet built"
 * - the processing runtime, the recall backends, the tool backends - and all
 * three had been built for weeks. Each had accumulated "what is now built" notes
 * and none had ever been closed. TD-009 still said "the seven descriptors" while
 * the surface had grown to twelve.
 *
 * Nothing was wrong with the code. What was wrong is that **someone planning the
 * next phase from this register would have counted three finished things as
 * debt**, and someone auditing it had to read fourteen prose entries and guess.
 *
 * Two checks, both cheap:
 *   1. every `## TD-NNN` entry has exactly one `- **Status**:` line
 *   2. the index table at the top lists every entry, and no entry it does not
 *
 * Deliberately NOT checked: whether the status is TRUE. No checker can read
 * "closed" and confirm the work happened - that is what an audit is for, and
 * pretending otherwise would make this look like more protection than it is.
 */

import { readFileSync } from "node:fs";

const FILE = "docs/60-operations/10-tech-debt.md";
const STRICT = process.argv.includes("--strict");

let text;
try {
  text = readFileSync(FILE, "utf8");
} catch (e) {
  console.log(`[tech-debt] skip: cannot read ${FILE} (${e.message})`);
  process.exit(0);
}

const problems = [];

// --- 1. entries -------------------------------------------------------------
// Split on the heading rather than using a lookahead. The first attempt wrote
// `(?=^## TD-|\Z)` and silently dropped the LAST entry: `\Z` is Python/PCRE, not
// JavaScript, so the alternation asked for a literal "Z". The checker reported it
// on its own first run - as "the index lists TD-015, which has no entry" - which
// is the only reason it is worth writing down here.
const entries = text
  .split(/^## (?=TD-\d+)/m)
  .slice(1)
  .map((chunk) => {
    const id = chunk.match(/^(TD-\d+)/);
    return id ? { id: id[1], body: chunk } : null;
  })
  .filter((e) => e !== null);
if (entries.length === 0) {
  console.error("[tech-debt] parsed zero entries - the checker is broken, fix it before trusting green");
  process.exit(1);
}

const ids = [];
for (const { id, body } of entries) {
  ids.push(id);
  const statuses = [...body.matchAll(/^- \*\*Status\*\*:/gm)];
  if (statuses.length === 0) {
    problems.push(`${id} has no "- **Status**:" line - a reader has to infer it from prose, which is how three finished items stayed on the debt list`);
  } else if (statuses.length > 1) {
    problems.push(`${id} has ${statuses.length} status lines - one entry, one status`);
  }
}

// --- 2. the index -----------------------------------------------------------
const indexed = new Set([...text.matchAll(/^\| `(TD-\d+)` \|/gm)].map((m) => m[1]));
for (const id of ids) {
  if (!indexed.has(id)) problems.push(`${id} is missing from the index table at the top`);
}
for (const id of indexed) {
  if (!ids.includes(id)) problems.push(`the index lists ${id}, which has no entry`);
}

if (problems.length > 0) {
  for (const p of problems) console.error(`[tech-debt] ${p}`);
  console.error(`[tech-debt] Fix ${FILE}: every entry needs one status line and an index row.`);
  process.exit(STRICT ? 1 : 0);
}

const open = [...text.matchAll(/^- \*\*Status\*\*:\s*(\S+)/gm)].filter((m) => /open/i.test(m[1])).length;
console.log(`[tech-debt] OK - ${ids.length} entries, all with a status and an index row (${open} open).`);
