#!/usr/bin/env node
/**
 * check-data-architecture.mjs - DDL <-> Prisma lockstep guardrail.
 *
 * The DDL under deploy/database/ddl/ is the single structure authority
 * (product_240 section 2.4 E); the Prisma schema is only a client-generation
 * source and MUST stay in lockstep. This asserts that the set of tables declared
 * in the baseline DDL equals the set of Prisma models (matched by @@schema +
 * @@map). Any drift fails under --strict (CI).
 *
 * Pure node, zero dependencies.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DDL = "deploy/database/ddl/00_baseline.sql";
const PRISMA = "portals/app/prisma/schema.prisma";
const LOCKS = "deploy/database/ddl/98_column_locks.sql";
const INCR_DIR = "deploy/database/ddl/incr";
const STRICT = process.argv.includes("--strict");

export function ddlTables(sql) {
  const set = new Set();
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\.(\w+)/gi;
  let m;
  while ((m = re.exec(sql))) set.add(`${m[1]}.${m[2]}`);
  return set;
}

export function prismaTables(text) {
  const set = new Set();
  const re = /model\s+\w+\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = re.exec(text))) {
    const body = m[1];
    const schema = /@@schema\("([^"]+)"\)/.exec(body);
    const map = /@@map\("([^"]+)"\)/.exec(body);
    if (schema && map) set.add(`${schema[1]}.${map[1]}`);
  }
  return set;
}


// --- grant lockstep ---------------------------------------------------------
//
// Every column-level UPDATE grant an increment carries must ALSO appear in
// 98_column_locks.sql. The two files serve different databases: an increment
// migrates an EXISTING one, 98 provisions a FRESH one (db-init runs
// baseline -> 97 -> 98 and never touches incr/*). A grant that lives only in an
// increment is therefore present on every migrated database and absent from
// every new environment - the worst shape a defect can have, because the
// databases you already have all work.
//
// This is not hypothetical. `active_chunk_version` was exactly that for six
// increments: migrated databases were fine, and a fresh db-init produced a
// pipeline whose atomic swap died with `permission denied for table document`,
// so no document could ever become retrievable. Found by accident in a
// get_context probe on 2026-08-26 - this check exists so the next one is not
// found by accident.
function grantMap(sql) {
  const stripped = sql.replace(/--[^\n]*/g, "");
  const out = new Map();
  const re = /GRANT\s+UPDATE\s*\(([^)]*)\)\s*ON\s+([\w.]+)\s+TO\s+karda_svc/gis;
  for (const m of stripped.matchAll(re)) {
    const table = m[2].toLowerCase();
    if (!out.has(table)) out.set(table, new Set());
    for (const c of m[1].split(",").map((x) => x.trim()).filter(Boolean)) out.get(table).add(c);
  }
  return out;
}

function grantDrift() {
  const locks = grantMap(readFileSync(LOCKS, "utf8"));
  const problems = [];
  for (const file of readdirSync(INCR_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    for (const [table, cols] of grantMap(readFileSync(join(INCR_DIR, file), "utf8"))) {
      const have = locks.get(table) ?? new Set();
      for (const c of [...cols].sort()) {
        if (!have.has(c)) problems.push(`${file}: GRANT UPDATE (${c}) ON ${table} never reaches a fresh database - mirror it into 98_column_locks.sql`);
      }
    }
  }
  return problems;
}

function diff(a, b) {
  return [...a].filter((x) => !b.has(x)).sort();
}

// Run only when invoked directly (not when imported by a test).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  let ddl, prisma;
  try {
    ddl = ddlTables(readFileSync(DDL, "utf8"));
    prisma = prismaTables(readFileSync(PRISMA, "utf8"));
  } catch (e) {
    console.log(`[data-architecture] skip: ${e.message}`);
    process.exit(0);
  }

  const onlyDdl = diff(ddl, prisma);
  const onlyPrisma = diff(prisma, ddl);

  const grants = grantDrift();
  if (grants.length > 0) {
    console.log("[data-architecture] grant drift (an increment-only grant never reaches a FRESH database):");
    for (const g of grants) console.log(`  ${g}`);
    if (STRICT) {
      console.error("[data-architecture] STRICT: every increment grant must be mirrored into 98_column_locks.sql.");
      process.exit(1);
    }
  }

  if (onlyDdl.length === 0 && onlyPrisma.length === 0) {
    console.log(`[data-architecture] OK - ${ddl.size} tables in lockstep (DDL == prisma), ${grants.length === 0 ? "grants mirrored" : "GRANTS DRIFTED"}.`);
    process.exit(0);
  }

  console.log("[data-architecture] DDL/prisma drift:");
  for (const t of onlyDdl) console.log(`  in DDL, missing from prisma: ${t}`);
  for (const t of onlyPrisma) console.log(`  in prisma, missing from DDL: ${t}`);
  if (STRICT) {
    console.error("[data-architecture] STRICT: DDL and prisma must be in lockstep.");
    process.exit(1);
  }
  process.exit(0);
}
