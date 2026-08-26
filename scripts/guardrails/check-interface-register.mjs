#!/usr/bin/env node
/**
 * check-interface-register.mjs - keep the interface register honest.
 *
 * `docs/30-design/260-external-interfaces.md` section 3 is the single list of the
 * `karda.*` tool surface. It exists because the previous single list - the table
 * in `120-retrieval-tools` section 6 - drifted twice: `karda.get_evidence` (#150)
 * and `karda.find_entity` (#152) both shipped while that table still said seven.
 *
 * A document cannot stop drifting by being told not to. This is the machine
 * check that makes the register's section 3 fail CI when it disagrees with
 * `kb/tools/catalog.ts`, which is the executable contract.
 *
 * Two directions, both fatal:
 *   - a tool in the catalog with no row in the register  (shipped, unregistered)
 *   - a row in the register with no tool in the catalog  (removed, still listed)
 *
 * Deliberately NOT checked: mode, metering, per-channel status. Those are
 * judgements the register records and the catalog cannot confirm - a checker
 * that guessed at them would either be wrong or force the doc to say only what
 * code already says, which would make it worthless. The set of tools is the part
 * where "the doc is stale" is a fact rather than an opinion.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REGISTER = join(ROOT, "docs", "30-design", "260-external-interfaces.md");
const CATALOG = join(ROOT, "portals", "app", "app", "kb", "tools", "catalog.ts");

const strict = process.argv.includes("--strict");

/** Tool names as the executable contract declares them. */
function catalogTools() {
  const src = readFileSync(CATALOG, "utf8");
  const body = src.slice(src.indexOf("export const TOOLS"));
  return new Set([...body.matchAll(/name:\s*"(karda\.[a-z_]+)"/g)].map((m) => m[1]));
}

/** Tool names the register lists, taken only from section 3's table rows. */
function registerTools() {
  const md = readFileSync(REGISTER, "utf8");
  const from = md.indexOf("## 3. ");
  const to = md.indexOf("### 3.1");
  if (from < 0 || to < 0 || to < from) {
    fail(["260-external-interfaces: cannot locate section 3 (the tool table) - has the document been restructured?"]);
  }
  const section = md.slice(from, to);
  return new Set(
    section
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .flatMap((l) => [...l.matchAll(/`(karda\.[a-z_]+)`/g)].map((m) => m[1])),
  );
}


/**
 * Every row marked 待对端 ("waiting on the counterpart") must name an issue.
 *
 * The register's own status vocabulary says so, and the rule earns its keep:
 * organising the upstream asks turned up one that had been "tracked" for over a
 * week in a workplan table and had NEVER been filed on the other side's repo.
 * A request nobody can see is not a request - it is a note to ourselves that
 * reads like one, which is worse than no entry at all, because it makes the
 * board look complete.
 *
 * Without a number, the honest status is 未实现.
 */
function pendingWithoutIssue() {
  const md = readFileSync(REGISTER, "utf8");
  const problems = [];
  md.split("\n").forEach((line, i) => {
    if (!line.startsWith("|") || !line.includes("待对端")) return;
    // A row that DEFINES the marker (section 2's vocabulary) or REFERS to it
    // (section 10's linkage registry, where it is quoted with guillemets) is not
    // a row that CARRIES it. Only a status assignment needs an issue number.
    if (line.startsWith("| **待对端**")) return;
    if (line.includes("「待对端」")) return;
    if (/#\d+/.test(line)) return;
    problems.push(`${REGISTER}:${i + 1}: a 待对端 row names no issue - file it, or mark it 未实现`);
  });
  return problems;
}

function fail(problems) {
  for (const p of problems) console.error(`[interface-register] ${p}`);
  console.error(
    "[interface-register] docs/30-design/260-external-interfaces.md is out of step. " +
      "For a tool mismatch, update section 3 including the per-channel status columns - " +
      "they are the reason the register exists. For a 待对端 row, file the issue on the " +
      "counterpart's repo and cite it, or mark the row 未实现.",
  );
  process.exit(strict ? 1 : 0);
}

const inCatalog = catalogTools();
const inRegister = registerTools();

if (inCatalog.size === 0) fail(["catalog.ts: parsed zero tools - the checker itself is broken, fix it before trusting a green run"]);

const problems = [
  ...[...inCatalog].filter((t) => !inRegister.has(t)).map((t) => `${t} ships but has no row in the register`),
  ...[...inRegister].filter((t) => !inCatalog.has(t)).map((t) => `${t} is listed in the register but no longer ships`),
  ...pendingWithoutIssue(),
];

if (problems.length > 0) fail(problems);
console.log(`[interface-register] OK - ${inCatalog.size} karda.* tools, register in step; every 待对端 names an issue.`);
