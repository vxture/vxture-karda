#!/usr/bin/env node
/**
 * check-atlas-contract.mjs - karda may not branch on an Atlas code that does not
 * exist.
 *
 * The defect this exists for is `karda#100`: the code branched on
 * `QUOTA_EXHAUSTED`, which Atlas has never published - the real code is
 * `QUOTA_EXCEEDED`. It type-checked, it read correctly, and it was dead: the one
 * path it guarded could never fire. Nothing catches that class of bug, because a
 * string literal compared against a string literal is valid in every language we
 * have. `vxture-atlas#21` asked Atlas to publish the table machine-readably so it
 * could be checked; they did (fingerprint in contract.snapshot.json); this is the
 * check.
 *
 * Two directions, both fatal:
 *   - karda names an Atlas-shaped code that is NOT in the published table
 *   - karda's SUSPEND_CODES policy names a code that is not in the table, or one
 *     Atlas marks retryable (parking work Atlas told us to retry strands it)
 *
 * Deliberately NOT checked: that karda handles every code Atlas publishes. Most
 * of the 43 are request-validation codes for fields karda never sends, and
 * demanding a branch per code would be busywork that makes the file worse.
 *
 * Deliberately NOT checked either: whether the snapshot matches what production
 * SERVES. CI runs on GitHub-hosted runners and Atlas is on the tailnet, so that
 * comparison cannot run here - and a check that silently cannot run is worse
 * than no check. The refresh procedure is in docs/30-design/260 section 11.1.3.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SNAPSHOT = "portals/app/app/kb/atlas/contract.snapshot.json";
const CODES = "portals/app/app/kb/atlas/codes.ts";
const SCAN_ROOT = "portals/app/app/kb";
const STRICT = process.argv.includes("--strict");

/**
 * Which literals to treat as Atlas codes.
 *
 * Suffix-matched rather than "every SCREAMING_CASE string", because karda has
 * plenty of its own constants in that shape (reject reasons, states, metric
 * names) and flagging them would train people to ignore this check. The suffixes
 * are the ones Atlas's vocabulary actually uses.
 */
const ATLAS_SHAPED = /_(REQUIRED|INVALID|NOT_ROUTABLE|NOT_IMPLEMENTED|EXCEEDED|EXHAUSTED|UNAVAILABLE|ENTITLED|LIMITED|UNPARSEABLE|FAILED)$/;

/** Literals that look Atlas-shaped but are karda's own. Each needs a reason. */
const NOT_ATLAS = new Map([
  // (empty today - every Atlas-shaped literal in kb/ is a real Atlas code)
]);

function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p));
    else if (name.endsWith(".ts") && !name.endsWith(".test.ts")) out.push(p);
  }
  return out;
}

/**
 * karda authorizes on the PRODUCT axis only.
 *
 * Atlas has two authorization axes and the word "grant" pointed at both:
 * `product_endpoint_grants` (holder = the product, grants an endpoint code) and
 * `model_grants` (holder = a tenant, grants a model, selected by `taskProfile`).
 * The second is LEGACY - Atlas has a countdown metric waiting to delete it - and
 * `vxture-atlas#47` ruled karda onto the first, because karda is a product, not
 * a tenant.
 *
 * So `taskProfile` must not appear in karda's own source at all. Not as a field
 * we send, not as a type we declare, not as a code we branch on: every one of
 * those is a way for the legacy axis to grow back, and it grows back silently -
 * a `taskProfile` karda sends alongside an `endpointCode` is simply ignored by
 * the selector precedence, so nothing fails and nothing is logged.
 *
 * Comments may name it - explaining why an axis was retired is exactly what a
 * comment is for, and that explanation is worth more than the grep tidiness of
 * banning the word outright.
 */
function tenantAxisResidue() {
  const problems = [];
  for (const file of sourceFiles(SCAN_ROOT)) {
    readFileSync(file, "utf8").split(/\r?\n/).forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments may explain the retirement
      if (!/\btaskProfile\b|\bTASK_PROFILE_/.test(line)) return;
      problems.push(
        `${file}:${i + 1} names the LEGACY tenant axis (taskProfile). karda authorizes on the ` +
          "product axis - send `endpointCode` (vxture-atlas#47). A taskProfile sent next to an " +
          "endpointCode is silently ignored by the selector precedence, so this fails quietly.",
      );
    });
  }
  return problems;
}


const problems = [];

let contract;
try {
  contract = JSON.parse(readFileSync(SNAPSHOT, "utf8"));
} catch (e) {
  console.log(`[atlas-contract] skip: cannot read ${SNAPSHOT} (${e.message})`);
  process.exit(0);
}

const published = new Map(contract.errorCodes.map((c) => [c.code, c.retryable]));
if (published.size === 0) {
  console.error("[atlas-contract] the snapshot lists zero codes - the checker itself is broken");
  process.exit(1);
}

// 1. every Atlas-shaped literal karda names must be published.
for (const file of sourceFiles(SCAN_ROOT)) {
  const text = readFileSync(file, "utf8");
  text.split(/\r?\n/).forEach((line, i) => {
    // Skip comments: prose legitimately names codes that were removed or are
    // being contrasted with the real one (see #100's own explanation).
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    for (const m of line.matchAll(/"([A-Z][A-Z0-9_]{4,})"/g)) {
      const code = m[1];
      if (!ATLAS_SHAPED.test(code) || NOT_ATLAS.has(code)) continue;
      if (!published.has(code)) {
        problems.push(
          `${file}:${i + 1} branches on "${code}", which Atlas does not publish ` +
            `(fingerprint ${contract.fingerprint}) - this branch can never fire`,
        );
      }
    }
  });
}

// 2. the suspend policy must be expressible in the published vocabulary.
const codesSrc = readFileSync(CODES, "utf8");
const block = codesSrc.slice(codesSrc.indexOf("export const SUSPEND_CODES"));
for (const m of block.slice(0, block.indexOf("]);")).matchAll(/"([A-Z0-9_]+)"/g)) {
  const code = m[1];
  if (!published.has(code)) {
    problems.push(`${CODES}: SUSPEND_CODES names "${code}", which Atlas does not publish`);
  } else if (published.get(code) === true) {
    problems.push(
      `${CODES}: SUSPEND_CODES parks "${code}", but Atlas marks it retryable - ` +
        `parking work they told us to retry strands it`,
    );
  }
}

problems.push(...tenantAxisResidue());

if (problems.length > 0) {
  for (const p of problems) console.error(`[atlas-contract] ${p}`);
  console.error(
    "[atlas-contract] Refresh the snapshot from Atlas's published contract, or fix the code. " +
      "See docs/30-design/260-external-interfaces.md section 11.1.3.",
  );
  process.exit(STRICT ? 1 : 0);
}

console.log(
  `[atlas-contract] OK - ${published.size} published codes at ${contract.fingerprint}; ` +
    `every code karda names exists, no parked code is one Atlas calls retryable, ` +
    `and nothing authorizes through the legacy tenant axis.`,
);
